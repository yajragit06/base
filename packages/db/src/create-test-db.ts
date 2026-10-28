import pg from "pg";

// Creates the disposable test database named in TEST_DATABASE_URL, using DATABASE_URL's
// server and user (local development only: tests truncate every table there).
const adminUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl || !testUrl) {
  console.error("DATABASE_URL and TEST_DATABASE_URL must both be set.");
  process.exit(1);
}
const name = decodeURIComponent(new URL(testUrl).pathname.slice(1));
if (name === "" || name === decodeURIComponent(new URL(adminUrl).pathname.slice(1))) {
  console.error("TEST_DATABASE_URL must name a separate database.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
try {
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
    console.log(`Created test database ${name}.`);
  } else {
    console.log(`Test database ${name} already exists.`);
  }
} finally {
  await client.end();
}
