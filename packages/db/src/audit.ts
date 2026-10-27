import { type AuditEntry, auditLog } from "./schema.js";
import type { Executor } from "./site-scope.js";

export interface NewAuditEntry {
  siteId: string;
  actorType: "user" | "agent" | "system";
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  diff: Record<string, unknown>;
}

/**
 * Appends one audit row on the caller's transaction. Row-level security only accepts it
 * when the transaction's `app.site_id` is `entry.siteId`.
 */
export async function insertAudit(tx: Executor, entry: NewAuditEntry): Promise<AuditEntry> {
  const [row] = await tx.insert(auditLog).values(entry).returning();
  if (!row) throw new Error("Insert returned no audit row.");
  return row;
}
