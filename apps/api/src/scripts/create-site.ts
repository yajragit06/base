import { parseArgs } from "node:util";
import { createDb } from "@cms/db";
import { createSiteWithOwner } from "../bootstrap.js";

// pnpm forwards the `--` separator itself; drop it so `create-site -- --name ...` works too.
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();

const { values } = parseArgs({
  args,
  options: {
    name: { type: "string" },
    "time-zone": { type: "string" },
    locale: { type: "string" },
    "owner-email": { type: "string" },
  },
});
const name = values.name;
const timeZone = values["time-zone"];
const locale = values.locale;
const ownerEmail = values["owner-email"];
if (!name || !timeZone || !locale || !ownerEmail) {
  console.error(
    "Usage: pnpm --filter @cms/api create-site -- --name <name> --time-zone <Area/City> --locale <tag> --owner-email <email>",
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");
const { db, pool } = createDb(url);
try {
  const site = await createSiteWithOwner(db, { name, timeZone, locale, ownerEmail });
  console.log(`Created site "${site.name}" (${site.id}) with owner ${ownerEmail}.`);
} finally {
  await pool.end();
}
