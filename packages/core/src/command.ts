import { type Db, DbError, type Executor, insertAudit, withSite } from "@cms/db";
import { type ContentType, fieldErrorsFromZod } from "@cms/schema";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { Actor, Authorizer } from "./authorize.js";
import { CommandError } from "./errors.js";

export interface AuditRecord {
  /** Required for install-level commands (no `siteId`); ignored for site-scoped ones. */
  siteId?: string;
  targetType: string;
  targetId: string;
  diff: Record<string, unknown>;
}

export interface CommandContext {
  actor: Actor;
  siteId: string | undefined;
  /** The install's content types by key (empty when `CommandDeps.contentTypes` is absent). */
  contentTypes: ReadonlyMap<string, ContentType>;
}

export interface Command<I, R> {
  readonly name: string;
  readonly permission: string;
  readonly input: z.ZodType<I>;
  siteId(input: I): string | undefined;
  handler(tx: Executor, input: I, ctx: CommandContext): Promise<{ result: R; audit: AuditRecord }>;
}

export function defineCommand<S extends z.ZodType, R>(def: {
  name: string;
  permission: string;
  input: S;
  siteId: (input: z.output<S>) => string | undefined;
  handler: (
    tx: Executor,
    input: z.output<S>,
    ctx: CommandContext,
  ) => Promise<{ result: R; audit: AuditRecord }>;
}): Command<z.output<S>, R> {
  return def as Command<z.output<S>, R>;
}

export interface CommandDeps {
  db: Db;
  authorize: Authorizer;
  /** The content types defined in code; commands that read or write entry data need them. */
  contentTypes?: readonly ContentType[];
}

function contentTypeMap(types: readonly ContentType[] = []): Map<string, ContentType> {
  const map = new Map<string, ContentType>();
  for (const type of types) {
    if (map.has(type.key)) throw new Error(`Content type "${type.key}" is defined twice.`);
    map.set(type.key, type);
  }
  return map;
}

/**
 * The single write path: validate, authorize, then run the change and its audit row in one
 * transaction (site-scoped through `withSite` when the command names a site).
 */
export async function runCommand<I, R>(
  deps: CommandDeps,
  command: Command<I, R>,
  actor: Actor,
  rawInput: unknown,
): Promise<R> {
  if (actor.id === "") throw new Error("A command needs an actor id.");
  const contentTypes = contentTypeMap(deps.contentTypes);
  const parsed = command.input.safeParse(rawInput, { reportInput: true });
  if (!parsed.success) {
    throw new CommandError(
      "invalid_input",
      "The input is invalid.",
      fieldErrorsFromZod(parsed.error),
    );
  }
  const input = parsed.data;
  const siteId = command.siteId(input);
  if (!(await deps.authorize(actor, command.permission, { siteId }))) {
    throw new CommandError("forbidden", "You do not have permission to do this.");
  }

  const execute = async (tx: Executor) => {
    const { result, audit } = await command.handler(tx, input, { actor, siteId, contentTypes });
    const auditSiteId = siteId ?? audit.siteId;
    if (auditSiteId === undefined) {
      throw new Error(`Command ${command.name} returned no site for its audit row.`);
    }
    if (siteId === undefined) {
      // Install-level commands are not inside withSite; scope the audit insert to the site.
      await tx.execute(sql`SELECT set_config('app.site_id', ${auditSiteId}, true)`);
    }
    await insertAudit(tx, {
      siteId: auditSiteId,
      actorType: actor.type,
      actorId: actor.id,
      action: command.name,
      targetType: audit.targetType,
      targetId: audit.targetId,
      diff: audit.diff,
    });
    return result;
  };

  try {
    return siteId === undefined
      ? await deps.db.transaction(execute)
      : await withSite(deps.db, siteId, execute);
  } catch (error) {
    if (error instanceof DbError) throw new CommandError(error.code, error.message);
    throw error;
  }
}
