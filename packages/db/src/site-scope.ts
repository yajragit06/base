import { sql } from "drizzle-orm";
import type { Db } from "./index.js";

export type SiteTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Runs `fn` in a transaction scoped to one site. Row-level security on tenant tables only
 * shows and accepts that site's rows; queries must still filter by `site_id` explicitly.
 */
export function withSite<T>(db: Db, siteId: string, fn: (tx: SiteTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE cms_app`);
    await tx.execute(sql`SELECT set_config('app.site_id', ${siteId}, true)`);
    return fn(tx);
  });
}
