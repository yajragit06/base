import {
  createSite,
  findOrCreateUser,
  ROLES,
  type Role,
  setMembershipInTx,
  withSite,
} from "@cms/db";
import { beforeEach, describe, expect, it } from "vitest";
import { PERMISSIONS, roleAuthorizer } from "./permissions.js";
import { useTestDb } from "./test/db.js";

const { db } = useTestDb();
const authorize = roleAuthorizer(db);
const base = { timeZone: "UTC", defaultLocale: "en", locales: ["en"] };

// The confirmed matrix (project-plan.md section 2), restated so a change to PERMISSIONS
// has to be made deliberately in both places.
const expected: Record<string, Role[]> = {
  "entry.create": ["owner", "admin", "editor", "author"],
  "site.addDomain": ["owner", "admin"],
  "membership.grant": ["owner", "admin"],
};

let siteA: string;
let siteB: string;

beforeEach(async () => {
  siteA = (await createSite(db, { ...base, name: "A" })).id;
  siteB = (await createSite(db, { ...base, name: "B" })).id;
});

async function userWithRole(role: Role, siteId: string) {
  const user = await findOrCreateUser(db, {
    authId: `auth_${role}_${siteId}`,
    email: `${role}@x.com`,
    name: null,
  });
  await withSite(db, siteId, (tx) => setMembershipInTx(tx, siteId, user.id, role));
  return { type: "user" as const, id: user.id };
}

describe("roleAuthorizer", () => {
  it("matches the confirmed role matrix", () => {
    expect(PERMISSIONS).toEqual(expected);
  });

  for (const [permission, allowed] of Object.entries(expected)) {
    for (const role of ROLES) {
      const should = allowed.includes(role);
      it(`${should ? "allows" : "denies"} ${role} for ${permission}`, async () => {
        const actor = await userWithRole(role, siteA);
        expect(await authorize(actor, permission, { siteId: siteA })).toBe(should);
      });
    }
  }

  it("denies a user with no membership, and a member of another site", async () => {
    const stranger = await findOrCreateUser(db, { authId: "auth_x", email: "x@x.com", name: null });
    expect(
      await authorize({ type: "user", id: stranger.id }, "entry.create", { siteId: siteA }),
    ).toBe(false);
    const ownerOfB = await userWithRole("owner", siteB);
    expect(await authorize(ownerOfB, "entry.create", { siteId: siteA })).toBe(false);
    expect(await authorize(ownerOfB, "membership.grant", { siteId: siteA })).toBe(false);
  });

  it("denies users install-level and unknown permissions", async () => {
    const owner = await userWithRole("owner", siteA);
    expect(await authorize(owner, "site.create", { siteId: undefined })).toBe(false);
    expect(await authorize(owner, "entry.delete", { siteId: siteA })).toBe(false);
  });

  it("denies agents and allows system actors", async () => {
    expect(await authorize({ type: "agent", id: "tok" }, "entry.create", { siteId: siteA })).toBe(
      false,
    );
    expect(
      await authorize({ type: "system", id: "seed" }, "site.create", { siteId: undefined }),
    ).toBe(true);
    expect(await authorize({ type: "system", id: "seed" }, "entry.create", { siteId: siteA })).toBe(
      true,
    );
  });
});
