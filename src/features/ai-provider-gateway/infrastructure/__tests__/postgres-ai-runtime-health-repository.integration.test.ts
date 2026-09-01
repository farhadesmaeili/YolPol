import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";

import type {AiRuntimeHealthPermit, AiRuntimeHealthTarget} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";
import {PostgresAiRuntimeHealthRepository} from "@/features/ai-provider-gateway/infrastructure/persistence/postgres/repositories/postgres-ai-runtime-health-repository";
import {aiProviderGatewayPostgresSchema} from "@/features/ai-provider-gateway/infrastructure/persistence/postgres/schema/ai-provider-gateway-schema";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";

let pool: Pool;
let repository: PostgresAiRuntimeHealthRepository;
const instant = (seconds: number) => new Date(Date.parse("2026-09-01T00:00:00.000Z") + seconds * 1_000);
const primary: AiRuntimeHealthTarget = Object.freeze({providerConfigurationId: "provider-a", modelProfileId: "profile-a", credentialReferenceId: "credential-primary"});
const backup: AiRuntimeHealthTarget = Object.freeze({...primary, credentialReferenceId: "credential-backup"});

async function clean(): Promise<void> {
  await pool.query("truncate table ai_provider_runtime_health, ai_model_profile_capabilities, ai_credential_references, ai_model_profiles, ai_provider_registry_events, ai_provider_configs");
}

async function seedTargets(): Promise<void> {
  const at = instant(0);
  await pool.query("insert into ai_provider_configs (id, adapter_key, display_name, enabled, priority, version, created_at, updated_at, updated_by) values ('provider-a', 'groq', 'Groq', true, 10, 1, $1, $1, 'staff:test')", [at]);
  await pool.query("insert into ai_model_profiles (id, provider_id, name, model_identifier, enabled, priority, max_output_tokens, version, created_at, updated_at, updated_by) values ('profile-a', 'provider-a', 'Primary', 'configured/model', true, 10, 512, 1, $1, $1, 'staff:test')", [at]);
  await pool.query("insert into ai_model_profile_capabilities (profile_id, capability) values ('profile-a', 'TEXT_GENERATION')");
  await pool.query("insert into ai_credential_references (id, provider_id, alias, credential_reference, enabled, priority, version, created_at, updated_at, updated_by) values ('credential-primary', 'provider-a', 'Primary', 'secret://ai/groq/primary', true, 10, 1, $1, $1, 'staff:test'), ('credential-backup', 'provider-a', 'Backup', 'secret://ai/groq/backup', true, 20, 1, $1, $1, 'staff:test')", [at]);
}

async function qualifyingFailure(target: AiRuntimeHealthTarget, at: Date): Promise<AiRuntimeHealthPermit> {
  const permit = await repository.acquire(target, at, 15_000);
  expect(permit).not.toBeNull();
  expect(await repository.recordQualifyingFailure(permit!, at, 3, 30_000)).toBe(true);
  return permit!;
}

beforeAll(async () => {
  pool = new Pool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: aiProviderGatewayPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  repository = new PostgresAiRuntimeHealthRepository(pool);
});
beforeEach(async () => {
  const identity = await pool.query<{current_database: string; current_user: string}>("select current_database(), current_user");
  expect(identity.rows[0]).toEqual({current_database: "yolpol_integration", current_user: "yolpol_test"});
  await clean(); await seedTargets();
});
afterEach(clean);
afterAll(async () => { if (pool) await pool.end(); });

describe("PostgresAiRuntimeHealthRepository", () => {
  it("persists closed health across repository instances and resets qualifying failures after success", async () => {
    const permit = await repository.acquire(primary, instant(1), 15_000);
    expect(permit).toMatchObject({halfOpenProbe: false});
    expect(await repository.recordQualifyingFailure(permit!, instant(2), 3, 30_000)).toBe(true);
    expect(await new PostgresAiRuntimeHealthRepository(pool).read(primary)).toMatchObject({state: "CLOSED", consecutiveFailures: 1, lastFailureAt: instant(2)});
    const successPermit = await repository.acquire(primary, instant(3), 15_000);
    expect(await repository.recordSuccess(successPermit!, instant(4))).toBe(true);
    expect(await repository.read(primary)).toMatchObject({state: "CLOSED", consecutiveFailures: 0, lastSuccessAt: instant(4), openUntil: null});
  });

  it("opens at the threshold, skips while open, leases one half-open probe, reopens on failure, and closes on a later success", async () => {
    await qualifyingFailure(primary, instant(1));
    await qualifyingFailure(primary, instant(2));
    await qualifyingFailure(primary, instant(3));
    expect(await repository.read(primary)).toMatchObject({state: "OPEN", consecutiveFailures: 3, openedAt: instant(3), openUntil: instant(33)});
    await expect(repository.acquire(primary, instant(20), 15_000)).resolves.toBeNull();

    const concurrent = await Promise.all([repository.acquire(primary, instant(34), 15_000), repository.acquire(primary, instant(34), 15_000)]);
    const probes = concurrent.filter((permit): permit is AiRuntimeHealthPermit => permit !== null);
    expect(probes).toHaveLength(1);
    expect(probes[0]).toMatchObject({halfOpenProbe: true});
    expect(await repository.recordQualifyingFailure(probes[0]!, instant(35), 3, 30_000)).toBe(true);
    expect(await repository.read(primary)).toMatchObject({state: "OPEN", openUntil: instant(65)});

    const successfulProbe = await repository.acquire(primary, instant(66), 15_000);
    expect(successfulProbe).toMatchObject({halfOpenProbe: true});
    expect(await repository.recordSuccess(successfulProbe!, instant(67))).toBe(true);
    expect(await repository.read(primary)).toMatchObject({state: "CLOSED", consecutiveFailures: 0, openedAt: null, openUntil: null, halfOpenLeaseUntil: null});
  });

  it("does not poison health for ignored invalid-request or safety-rejection outcomes", async () => {
    const invalidPermit = await repository.acquire(primary, instant(1), 15_000);
    expect(await repository.releaseWithoutHealthChange(invalidPermit!, instant(2))).toBe(true);
    const safetyPermit = await repository.acquire(primary, instant(3), 15_000);
    expect(await repository.releaseWithoutHealthChange(safetyPermit!, instant(4))).toBe(true);
    expect(await repository.read(primary)).toMatchObject({state: "CLOSED", consecutiveFailures: 0, lastFailureAt: null});
  });

  it("keeps credentials independent", async () => {
    await qualifyingFailure(primary, instant(1));
    const backupPermit = await repository.acquire(backup, instant(2), 15_000);
    expect(backupPermit).not.toBeNull();
    expect(await repository.recordSuccess(backupPermit!, instant(3))).toBe(true);
    expect(await repository.read(primary)).toMatchObject({consecutiveFailures: 1});
    expect(await repository.read(backup)).toMatchObject({consecutiveFailures: 0, lastSuccessAt: instant(3)});
  });

  it("uses versioned permits so a stale concurrent result cannot overwrite newer health", async () => {
    const stale = await repository.acquire(primary, instant(1), 15_000);
    const current = await repository.acquire(primary, instant(2), 15_000);
    expect(await repository.recordSuccess(stale!, instant(3))).toBe(false);
    expect(await repository.recordQualifyingFailure(current!, instant(4), 3, 30_000)).toBe(true);
    expect(await repository.read(primary)).toMatchObject({consecutiveFailures: 1, lastSuccessAt: null, lastFailureAt: instant(4)});
  });

  it("stores only target and circuit metadata, never prompt or generated content", async () => {
    const permit = await repository.acquire(primary, instant(1), 15_000);
    await repository.recordSuccess(permit!, instant(2));
    const columns = await pool.query<{column_name: string}>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ai_provider_runtime_health' order by ordinal_position");
    expect(columns.rows.map(({column_name}) => column_name)).toEqual([
      "provider_configuration_id", "model_profile_id", "credential_reference_id", "state", "consecutive_failures",
      "last_success_at", "last_failure_at", "opened_at", "open_until", "half_open_lease_until", "updated_at", "version",
    ]);
    const rows = JSON.stringify((await pool.query("select * from ai_provider_runtime_health")).rows).toLowerCase();
    for (const content of ["prompt", "system message", "customer text", "generated response"]) expect(rows).not.toContain(content);
  });
});
