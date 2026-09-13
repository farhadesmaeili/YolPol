import {resolve} from "node:path";

import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const {Pool} = pg;
const migrationAdvisoryLockId = "90457420220057";

function databaseUrl(value) {
  if (!value) throw new Error("DATABASE_URL is required for migrations.");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol)
    || !url.hostname
    || !url.username
    || !url.password
    || url.pathname.length < 2
  ) {
    throw new Error("DATABASE_URL must be a complete PostgreSQL URL.");
  }

  return value;
}

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    event,
    service: "database-migration",
    ...fields,
  })}\n`);
}

async function run() {
  const pool = new Pool({
    connectionString: databaseUrl(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
  });
  let locked = false;

  try {
    log("migration.lock_waiting");
    await pool.query("select pg_advisory_lock($1::bigint)", [migrationAdvisoryLockId]);
    locked = true;
    log("migration.started");
    await migrate(drizzle(pool), {migrationsFolder: resolve("drizzle")});
    log("migration.completed");
  } finally {
    if (locked) await pool.query("select pg_advisory_unlock($1::bigint)", [migrationAdvisoryLockId]);
    await pool.end();
  }
}

run().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "migration.failed",
    service: "database-migration",
    error: {name: error instanceof Error ? error.name : "UnknownError"},
  })}\n`);
  process.exitCode = 1;
});
