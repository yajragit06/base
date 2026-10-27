import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DbError } from "./errors.js";
import { addDomain, createSite, findSiteByHost, listSites } from "./sites.js";
import { useTestDb } from "./test/db.js";

const { db } = useTestDb();

const valid = { name: "Acme", timeZone: "Asia/Brunei", defaultLocale: "en", locales: ["en", "ms"] };

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DbError) return error.code;
    throw error;
  }
  return "ok";
}

describe("createSite", () => {
  it("stores a valid site", async () => {
    const site = await createSite(db, { ...valid, name: "  Acme  " });
    expect(site).toMatchObject({
      name: "Acme",
      timeZone: "Asia/Brunei",
      defaultLocale: "en",
      locales: ["en", "ms"],
    });
    expect(site.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects invalid input with stable codes", async () => {
    expect(await codeOf(createSite(db, { ...valid, name: " " }))).toBe("invalid_name");
    expect(await codeOf(createSite(db, { ...valid, timeZone: "Mars/Base" }))).toBe(
      "invalid_time_zone",
    );
    for (const timeZone of [
      "+01:00",
      "-05:00",
      "utc",
      "europe/paris",
      "EST",
      "Mars/Olympus_Mons",
      "posixrules",
    ]) {
      expect(await codeOf(createSite(db, { ...valid, timeZone }))).toBe("invalid_time_zone");
    }
    expect(await codeOf(createSite(db, { ...valid, locales: [] }))).toBe("invalid_locale");
    expect(await codeOf(createSite(db, { ...valid, locales: ["en", "not a tag"] }))).toBe(
      "invalid_locale",
    );
    expect(await codeOf(createSite(db, { ...valid, locales: ["en", "en-us"] }))).toBe(
      "invalid_locale",
    );
    expect(await codeOf(createSite(db, { ...valid, locales: ["en", "en"] }))).toBe(
      "invalid_locale",
    );
    expect(await codeOf(createSite(db, { ...valid, defaultLocale: "fr" }))).toBe(
      "invalid_default_locale",
    );
    expect(await listSites(db)).toEqual([]);
  });

  it("lists sites by name", async () => {
    await createSite(db, { ...valid, name: "Beta" });
    await createSite(db, { ...valid, name: "Alpha" });
    expect((await listSites(db)).map((s) => s.name)).toEqual(["Alpha", "Beta"]);
  });
});

describe("domains", () => {
  it("stores hosts lowercase and finds sites by host, ignoring case", async () => {
    const site = await createSite(db, valid);
    const domain = await addDomain(db, site.id, { host: "WWW.Acme.com", primary: true });
    expect(domain).toMatchObject({ host: "www.acme.com", isPrimary: true });
    await addDomain(db, site.id, { host: "localhost:3000" });
    expect((await findSiteByHost(db, "www.ACME.com"))?.id).toBe(site.id);
    expect((await findSiteByHost(db, "localhost:3000"))?.id).toBe(site.id);
    expect(await findSiteByHost(db, "other.com")).toBeNull();
  });

  it("accepts canonical zone names", async () => {
    for (const timeZone of [
      "UTC",
      "Etc/UTC",
      "Europe/Paris",
      "Asia/Brunei",
      "Asia/Kolkata",
      "Europe/Kyiv",
    ]) {
      expect(await codeOf(createSite(db, { ...valid, timeZone }))).toBe("ok");
    }
  });

  it("rejects hostnames longer than 253 characters", async () => {
    const site = await createSite(db, valid);
    const label = "a".repeat(63);
    const longest = [label, label, label, "a".repeat(61)].join(".");
    expect(longest).toHaveLength(253);
    expect(await codeOf(addDomain(db, site.id, { host: `${longest}:8080` }))).toBe("ok");
    expect(await codeOf(addDomain(db, site.id, { host: `${longest}a` }))).toBe("invalid_host");
  });

  it("rejects malformed hosts", async () => {
    const site = await createSite(db, valid);
    for (const host of [
      "https://acme.com",
      "acme.com/path",
      "",
      "-acme.com",
      "acme..com",
      "a b.com",
      "acme.com:0",
      "acme.com:65536",
      `${"a".repeat(64)}.com`,
    ]) {
      expect(await codeOf(addDomain(db, site.id, { host }))).toBe("invalid_host");
    }
  });

  it("allows each host on one site only, across the install", async () => {
    const a = await createSite(db, valid);
    const b = await createSite(db, { ...valid, name: "Other" });
    await addDomain(db, a.id, { host: "acme.com" });
    expect(await codeOf(addDomain(db, b.id, { host: "ACME.com" }))).toBe("host_taken");
    expect(await codeOf(addDomain(db, a.id, { host: "acme.com" }))).toBe("host_taken");
  });

  it("allows one primary domain per site", async () => {
    const a = await createSite(db, valid);
    const b = await createSite(db, { ...valid, name: "Other" });
    await addDomain(db, a.id, { host: "a.com", primary: true });
    expect(await codeOf(addDomain(db, a.id, { host: "a2.com", primary: true }))).toBe(
      "primary_domain_exists",
    );
    expect(await codeOf(addDomain(db, b.id, { host: "b.com", primary: true }))).toBe("ok");
  });

  it("rejects an unknown site", async () => {
    expect(
      await codeOf(addDomain(db, "00000000-0000-4000-8000-000000000000", { host: "x.com" })),
    ).toBe("site_not_found");
    expect(await codeOf(addDomain(db, "not-a-uuid", { host: "x.com" }))).toBe("site_not_found");
  });
});

describe("database role", () => {
  // The app must connect as the user that ran the migrations: only it is granted cms_app.
  it("lets the migrating user switch to cms_app", async () => {
    const { rows } = await db.execute<{ member: boolean }>(
      sql`SELECT pg_has_role(current_user, 'cms_app', 'MEMBER') AS member`,
    );
    expect(rows[0]?.member).toBe(true);
  });
});
