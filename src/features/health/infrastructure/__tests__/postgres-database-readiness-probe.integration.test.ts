import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import type {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {PostgresDatabaseReadinessProbe} from "@/features/health/infrastructure/database/postgres-database-readiness-probe";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";

describe("PostgreSQL health readiness integration", () => {
  let pool: Pool | undefined;

  beforeAll(async () => {
    pool = createPostgresPool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
    await migrate(drizzle(pool, {schema: inquiryPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  });

  afterAll(async () => { await pool?.end(); });

  it("accepts the disposable database after all repository migrations are applied", async () => {
    if (!pool) throw new Error("Disposable PostgreSQL pool was not initialized.");
    const database = pool;
    await expect(new PostgresDatabaseReadinessProbe(() => database).check()).resolves.toBeUndefined();
  });
});
