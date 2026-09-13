import {readFile} from "node:fs/promises";
import {describe, expect, it, vi} from "vitest";

import {
  databaseReadinessQueryTimeoutMilliseconds,
  DatabaseSchemaNotReadyError,
  expectedDatabaseMigrationTimestamp,
  PostgresDatabaseReadinessProbe,
} from "@/features/health/infrastructure/database/postgres-database-readiness-probe";

describe("PostgreSQL database readiness", () => {
  it("uses one bounded migration-state query", async () => {
    const query = vi.fn().mockResolvedValue({rows: [{created_at: String(expectedDatabaseMigrationTimestamp)}]});
    await expect(new PostgresDatabaseReadinessProbe(() => ({query})).check()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith({
      text: "select created_at from drizzle.__drizzle_migrations order by id desc limit 1",
      query_timeout: databaseReadinessQueryTimeoutMilliseconds,
    });
  });

  it.each([
    {rows: []},
    {rows: [{created_at: null}]},
    {rows: [{created_at: expectedDatabaseMigrationTimestamp - 1}]},
  ])(
    "fails when the expected migration is absent",
    async ({rows}) => {
      const query = vi.fn().mockResolvedValue({rows});
      await expect(new PostgresDatabaseReadinessProbe(() => ({query})).check())
        .rejects.toBeInstanceOf(DatabaseSchemaNotReadyError);
    },
  );

  it("keeps the expected migration timestamp synchronized with the Drizzle journal", async () => {
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as {
      entries: Array<{when: number}>;
    };
    expect(journal.entries.at(-1)?.when).toBe(expectedDatabaseMigrationTimestamp);
  });
});
