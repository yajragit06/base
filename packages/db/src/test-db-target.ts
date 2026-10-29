// Checks for `pnpm db:create-test`. Messages never include a URL or password: Node's
// own invalid-URL error prints the whole input, so parsing happens here.
export type TestDbTarget =
  | { ok: true; name: string; server: string }
  | { ok: false; error: string };

function parse(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/** Where the disposable test database goes: its name and DATABASE_URL's host. */
export function testDbTarget(adminUrl: string, testUrl: string): TestDbTarget {
  const admin = parse(adminUrl);
  const test = parse(testUrl);
  if (!admin || !test) {
    return { ok: false, error: "DATABASE_URL or TEST_DATABASE_URL is not a valid URL." };
  }
  let name: string;
  let adminName: string;
  try {
    name = decodeURIComponent(test.pathname.slice(1));
    adminName = decodeURIComponent(admin.pathname.slice(1));
  } catch {
    return { ok: false, error: "DATABASE_URL or TEST_DATABASE_URL is not a valid URL." };
  }
  if (name === "" || name === adminName) {
    return { ok: false, error: "TEST_DATABASE_URL must name a separate database." };
  }
  // The database is created on DATABASE_URL's server, so both must name the same one.
  if (test.host !== admin.host) {
    return {
      ok: false,
      error: "DATABASE_URL and TEST_DATABASE_URL must point at the same server.",
    };
  }
  return { ok: true, name, server: admin.host };
}
