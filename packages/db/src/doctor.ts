import { readFileSync } from "node:fs";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./index.js";
import { migrationsFolder } from "./migrations.js";
import * as schema from "./schema.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const API_ROLES = ["anon", "authenticated"];

/** A text[] literal of bound parameters (drizzle expands a plain array into a list). */
function textArray(values: string[]) {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

/** The tables Base's migrations create (not Supabase's own). */
export function baseTableNames(): string[] {
  return Object.values(schema as Record<string, unknown>)
    .filter((value: unknown): value is PgTable => is(value, PgTable))
    .map((table) => getTableName(table))
    .sort();
}

function migrationCount(): number {
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as {
    entries: unknown[];
  };
  return journal.entries.length;
}

/**
 * Read-only checks that a database is safe and ready for Base, on Supabase or plain
 * Postgres. Never reports connection details.
 */
export async function runDoctor(db: Db): Promise<Check[]> {
  const tables = baseTableNames();
  const checks: Check[] = [];

  const expected = migrationCount();
  const { rows: applied } = await db.execute<{ n: number }>(sql`
    SELECT CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN 0
      ELSE (SELECT count(*)::int FROM drizzle.__drizzle_migrations) END AS n`);
  const n = applied[0]?.n ?? 0;
  checks.push({
    name: "migrations",
    ok: n === expected,
    detail: `${n} of ${expected} applied`,
  });

  const { rows: member } = await db.execute<{ member: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cms_app')
      AND pg_has_role(current_user, 'cms_app', 'MEMBER') AS member`);
  checks.push({
    name: "role",
    ok: member[0]?.member === true,
    detail:
      member[0]?.member === true
        ? "connecting user is a member of cms_app"
        : "connecting user is not a member of cms_app (run migrations as this user)",
  });

  const { rows: grants } = await db.execute<{ role: string; table: string }>(sql`
    SELECT r.rolname AS role, c.relname AS table
    FROM pg_roles r
    CROSS JOIN pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
    WHERE r.rolname = ANY(${textArray(API_ROLES)})
      AND c.relkind = 'r'
      AND c.relname = ANY(${textArray(tables)})
      AND (has_table_privilege(r.oid, c.oid, 'SELECT') OR has_table_privilege(r.oid, c.oid, 'INSERT')
        OR has_table_privilege(r.oid, c.oid, 'UPDATE') OR has_table_privilege(r.oid, c.oid, 'DELETE'))
    ORDER BY 1, 2`);
  checks.push({
    name: "api roles",
    ok: grants.length === 0,
    detail:
      grants.length === 0
        ? "anon and authenticated hold no privileges on Base tables"
        : `privileges granted: ${grants.map((g) => `${g.role} on ${g.table}`).join(", ")}`,
  });

  const { rows: rls } = await db.execute<{ table: string; enabled: boolean }>(sql`
    SELECT c.relname AS table, c.relrowsecurity AS enabled
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
    WHERE c.relkind = 'r' AND c.relname = ANY(${textArray(tables)})`);
  const missing = tables.filter((t) => !rls.some((r) => r.table === t));
  const disabled = rls.filter((r) => !r.enabled).map((r) => r.table);
  checks.push({
    name: "row-level security",
    ok: missing.length === 0 && disabled.length === 0,
    detail:
      missing.length > 0
        ? `tables missing: ${missing.join(", ")}`
        : disabled.length > 0
          ? `disabled on ${disabled.join(", ")}`
          : `enabled on all ${tables.length} Base tables`,
  });

  return checks;
}

export function formatChecks(checks: Check[]): string {
  return checks.map((c) => `${c.ok ? "ok  " : "fail"} ${c.name}: ${c.detail}`).join("\n");
}
