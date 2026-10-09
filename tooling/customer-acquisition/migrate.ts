import {resolve} from "node:path";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {acquisitionDatabaseConfig} from "../../src/features/customer-acquisition/infrastructure/config/acquisition-config";

export async function migrateAcquisition() {
  const pool = new Pool(acquisitionDatabaseConfig(process.env, "migration"));
  let stage = "connect";
  try {
    const client = await pool.connect();
    try {
      stage = "identity";
      const identity = await client.query("select current_database() as database, current_user as role");
      if (identity.rows[0]?.database !== "yolpol_acquisition" || identity.rows[0]?.role !== "acquisition_migrator") throw new Error("Migration identity rejected.");
      stage = "lock";
      await client.query("select pg_advisory_lock(820083)");
      stage = "migration";
      await migrate(drizzle(client), {migrationsFolder: resolve("drizzle-customer-acquisition")});
      console.info('{"event":"acquisition.migration_completed"}');
    } finally {
      // Destroy the dedicated session: PostgreSQL releases its session lock even
      // after a failed migration/query, without relying on another successful query.
      client.release(true);
    }
  } catch (error) {
    const cause = error instanceof Error && error.cause ? error.cause : error;
    const code = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string" && /^[0-9A-Z]{5}$/u.test(cause.code) ? cause.code : "UNAVAILABLE";
    console.error(JSON.stringify({event: "acquisition.migration_failed", stage, code}));
    throw error;
  } finally { await pool.end(); }
}

if (require.main === module) void migrateAcquisition().catch(() => { console.error('{"event":"acquisition.migration_failed"}'); process.exitCode = 1; });
