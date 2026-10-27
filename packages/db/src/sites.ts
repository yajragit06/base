import { asc, eq } from "drizzle-orm";
import { DbError, UNIQUE_VIOLATION, violatedConstraint } from "./errors.js";
import type { Db } from "./index.js";
import { type Domain, domains, type Site, sites } from "./schema.js";

const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

const MAX_HOSTNAME = 253;

// Intl also accepts UTC offsets and aliases such as "utc" or "EST"; Postgres reads offset
// strings with the opposite sign, so only canonical zone names are stored.
function isTimeZone(zone: string): boolean {
  if (zone.startsWith("+") || zone.startsWith("-")) return false;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone === zone;
  } catch {
    return false;
  }
}

function canonicalLocale(locale: string): string | undefined {
  try {
    const [canonical] = Intl.getCanonicalLocales(locale);
    return canonical === locale ? canonical : undefined;
  } catch {
    return undefined;
  }
}

export interface NewSite {
  name: string;
  timeZone: string;
  defaultLocale: string;
  locales: string[];
}

export async function createSite(db: Db, input: NewSite): Promise<Site> {
  const name = input.name.trim();
  if (name === "") throw new DbError("invalid_name", "A site needs a name.");
  if (!isTimeZone(input.timeZone)) {
    throw new DbError("invalid_time_zone", `"${input.timeZone}" is not an IANA time zone.`);
  }
  if (input.locales.length === 0) {
    throw new DbError("invalid_locale", "A site needs at least one locale.");
  }
  for (const locale of input.locales) {
    if (!canonicalLocale(locale)) {
      throw new DbError("invalid_locale", `"${locale}" is not a canonical BCP 47 locale tag.`);
    }
  }
  if (new Set(input.locales).size !== input.locales.length) {
    throw new DbError("invalid_locale", "Locales must not repeat.");
  }
  if (!input.locales.includes(input.defaultLocale)) {
    throw new DbError("invalid_default_locale", "The default locale must be one of the locales.");
  }
  const [site] = await db
    .insert(sites)
    .values({
      name,
      timeZone: input.timeZone,
      defaultLocale: input.defaultLocale,
      locales: input.locales,
    })
    .returning();
  if (!site) throw new Error("Insert returned no site.");
  return site;
}

export async function addDomain(
  db: Db,
  siteId: string,
  input: { host: string; primary?: boolean },
): Promise<Domain> {
  const host = input.host.toLowerCase();
  const hostname = host.split(":")[0] ?? "";
  if (!HOST.test(host) || hostname.length > MAX_HOSTNAME) {
    throw new DbError("invalid_host", `"${input.host}" is not a hostname with an optional port.`);
  }
  if (!isUuid(siteId)) throw new DbError("site_not_found", "Site not found.");
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId));
  if (!site) throw new DbError("site_not_found", "Site not found.");
  try {
    const [domain] = await db
      .insert(domains)
      .values({ siteId, host, isPrimary: input.primary ?? false })
      .returning();
    if (!domain) throw new Error("Insert returned no domain.");
    return domain;
  } catch (error) {
    const constraint = violatedConstraint(error, [UNIQUE_VIOLATION]);
    if (constraint === "domains_host_key") {
      throw new DbError("host_taken", `"${host}" already belongs to a site.`);
    }
    if (constraint === "domains_one_primary_per_site") {
      throw new DbError("primary_domain_exists", "This site already has a primary domain.");
    }
    throw error;
  }
}

export function listSites(db: Db): Promise<Site[]> {
  return db.select().from(sites).orderBy(asc(sites.name), asc(sites.id));
}

export async function findSiteByHost(db: Db, host: string): Promise<Site | null> {
  const [row] = await db
    .select({ site: sites })
    .from(domains)
    .innerJoin(sites, eq(domains.siteId, sites.id))
    .where(eq(domains.host, host.toLowerCase()));
  return row?.site ?? null;
}
