import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";

import {InvalidStoredAiOperationsPolicyError, type AiOperationsPolicyEvent} from "@/features/ai-operations/application/ports/ai-operations-ports";
import {AiOperationsPolicy} from "@/features/ai-operations/domain/entities/ai-operations-policy";
import {PostgresAiOperationsPolicyRepository} from "@/features/ai-operations/infrastructure/persistence/postgres/repositories/postgres-ai-operations-policy-repository";
import {aiOperationsPostgresSchema} from "@/features/ai-operations/infrastructure/persistence/postgres/schema/ai-operations-schema";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";

let pool: Pool;
let repository: PostgresAiOperationsPolicyRepository;

const policy = (version: number, mode: "DISABLED" | "FALLBACK" | "SCHEDULED" = "SCHEDULED", occurredAt = `2026-09-01T00:0${version - 1}:00.000Z`) => AiOperationsPolicy.create({
  mode,
  businessTimeZone: "Asia/Tehran",
  humanGracePeriodSeconds: 900,
  scheduleWindows: mode === "SCHEDULED" ? [{weekday: "MONDAY", startMinute: 1_200, endMinute: 480, enabled: true}] : [],
  version,
  updatedAt: new Date(occurredAt),
  updatedBy: "staff:member-1",
});

const event = (id: string, next: AiOperationsPolicy, previous: AiOperationsPolicy | null): AiOperationsPolicyEvent => ({
  id,
  eventType: previous ? "POLICY_UPDATED" : "POLICY_CREATED",
  previousPolicy: previous,
  newPolicy: next,
  actorReference: next.updatedBy,
  occurredAt: next.updatedAt,
});

async function clean() { await pool.query("truncate table ai_schedule_windows, ai_policy_events, ai_operation_policy"); }

beforeAll(async () => {
  pool = new Pool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: aiOperationsPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  repository = new PostgresAiOperationsPolicyRepository(pool);
});

beforeEach(async () => {
  const identity = await pool.query<{current_database: string; current_user: string}>("select current_database(), current_user");
  expect(identity.rows[0]).toEqual({current_database: "yolpol_integration", current_user: "yolpol_test"});
  await clean();
});
afterEach(clean);
afterAll(async () => { if (pool) await pool.end(); });

describe("PostgresAiOperationsPolicyRepository", () => {
  it("round-trips the singleton policy, normalized rows, and newest-first audit snapshots", async () => {
    expect(await repository.find()).toBeNull();
    const first = policy(1);
    expect(await repository.save(first, event("aipe_event-1", first, null), 0)).toBe("saved");
    expect(await repository.find()).toMatchObject({version: 1, businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 900, scheduleWindows: [
      {weekday: "MONDAY", startMinute: 1_200, endMinute: 1_440, enabled: true},
      {weekday: "TUESDAY", startMinute: 0, endMinute: 480, enabled: true},
    ]});
    const second = policy(2, "FALLBACK");
    expect(await repository.save(second, event("aipe_event-2", second, first), 1)).toBe("saved");
    const history = await repository.readEvents(100);
    expect(history.map((entry) => entry.id)).toEqual(["aipe_event-2", "aipe_event-1"]);
    expect(history[0]).toMatchObject({previousVersion: 1, newVersion: 2, actorReference: "staff:member-1", previousPolicy: {mode: "SCHEDULED"}, newPolicy: {mode: "FALLBACK"}});
  });

  it("permits only one concurrent compare-and-swap update", async () => {
    const first = policy(1);
    await repository.save(first, event("aipe_initial", first, null), 0);
    const secondA = policy(2, "FALLBACK", "2026-09-01T00:01:00.000Z");
    const secondB = policy(2, "DISABLED", "2026-09-01T00:01:01.000Z");
    const results = await Promise.all([
      repository.save(secondA, event("aipe_update-a", secondA, first), 1),
      repository.save(secondB, event("aipe_update-b", secondB, first), 1),
    ]);
    expect(results.sort()).toEqual(["conflict", "saved"]);
    expect((await repository.readEvents(100))).toHaveLength(2);
    expect((await repository.find())?.version).toBe(2);
  });

  it("rolls back the policy and windows when the audit append fails", async () => {
    const first = policy(1);
    await repository.save(first, event("aipe_duplicate", first, null), 0);
    const second = policy(2, "FALLBACK");
    await expect(repository.save(second, event("aipe_duplicate", second, first), 1)).rejects.toBeDefined();
    expect(await repository.find()).toMatchObject({version: 1, mode: "SCHEDULED"});
    expect(await repository.readEvents(100)).toHaveLength(1);
  });

  it("fails closed on invalid stored time zones and database-enforces append-only audit rows", async () => {
    const first = policy(1);
    await repository.save(first, event("aipe_immutable", first, null), 0);
    await pool.query("update ai_operation_policy set business_time_zone = 'Mars/Olympus' where id = 'global'");
    await expect(repository.find()).rejects.toBeInstanceOf(InvalidStoredAiOperationsPolicyError);
    await expect(pool.query("update ai_policy_events set actor_reference = 'staff:other' where id = 'aipe_immutable'")).rejects.toMatchObject({code: "55000"});
    await expect(pool.query("delete from ai_policy_events where id = 'aipe_immutable'")).rejects.toMatchObject({code: "55000"});
  });

  it("database constraints reject orphaned and invalid structured schedule rows", async () => {
    await expect(pool.query("insert into ai_schedule_windows (policy_id,position,weekday,start_minute,end_minute,enabled) values ('missing',0,'MONDAY',540,600,true)")).rejects.toMatchObject({code: "23503"});
    const first = policy(1);
    await repository.save(first, event("aipe_constraints", first, null), 0);
    await expect(pool.query("insert into ai_schedule_windows (policy_id,position,weekday,start_minute,end_minute,enabled) values ('global',9,'MONDAY',600,600,true)")).rejects.toMatchObject({code: "23514"});
  });
});
