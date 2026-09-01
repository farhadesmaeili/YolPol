import type {Pool, PoolClient} from "pg";

import type {AiRuntimeHealthRepository} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";
import {AiRuntimeHealthPersistenceError} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";
import type {AiRuntimeHealthPermit, AiRuntimeHealthSnapshot, AiRuntimeHealthTarget} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

type HealthRow = Readonly<{
  provider_configuration_id: string;
  model_profile_id: string;
  credential_reference_id: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  consecutive_failures: number;
  last_success_at: Date | null;
  last_failure_at: Date | null;
  opened_at: Date | null;
  open_until: Date | null;
  half_open_lease_until: Date | null;
  updated_at: Date;
  version: number;
}>;

const targetValues = (target: AiRuntimeHealthTarget): [string, string, string] => [target.providerConfigurationId, target.modelProfileId, target.credentialReferenceId];

function toSnapshot(row: HealthRow): AiRuntimeHealthSnapshot {
  return Object.freeze({
    providerConfigurationId: row.provider_configuration_id,
    modelProfileId: row.model_profile_id,
    credentialReferenceId: row.credential_reference_id,
    state: row.state,
    consecutiveFailures: row.consecutive_failures,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    openedAt: row.opened_at,
    openUntil: row.open_until,
    halfOpenLeaseUntil: row.half_open_lease_until,
    updatedAt: row.updated_at,
    version: row.version,
  });
}

async function rollback(client: PoolClient): Promise<void> {
  try { await client.query("rollback"); } catch { /* original safe persistence error wins */ }
}

export class PostgresAiRuntimeHealthRepository implements AiRuntimeHealthRepository {
  constructor(private readonly pool: Pool) {}

  async acquire(target: AiRuntimeHealthTarget, now: Date, halfOpenLeaseMs: number): Promise<AiRuntimeHealthPermit | null> {
    if (!Number.isSafeInteger(halfOpenLeaseMs) || halfOpenLeaseMs < 100 || halfOpenLeaseMs > 300_000) throw new RangeError("Half-open lease must be between 100 and 300000 milliseconds.");
    let client: PoolClient;
    try { client = await this.pool.connect(); }
    catch { throw new AiRuntimeHealthPersistenceError(); }
    try {
      await client.query("begin");
      const values = targetValues(target);
      await client.query(
        `insert into ai_provider_runtime_health (
          provider_configuration_id, model_profile_id, credential_reference_id, state,
          consecutive_failures, updated_at, version
        ) values ($1, $2, $3, 'CLOSED', 0, $4, 1)
        on conflict (provider_configuration_id, model_profile_id, credential_reference_id) do nothing`,
        [...values, now],
      );
      const selected = await client.query<HealthRow>(
        `select * from ai_provider_runtime_health
         where provider_configuration_id = $1 and model_profile_id = $2 and credential_reference_id = $3
         for update`, values,
      );
      const row = selected.rows[0];
      if (!row) throw new AiRuntimeHealthPersistenceError();

      const openUntil = row.open_until?.getTime() ?? 0;
      const leaseUntil = row.half_open_lease_until?.getTime() ?? 0;
      if ((row.state === "OPEN" && openUntil > now.getTime()) || (row.state === "HALF_OPEN" && leaseUntil > now.getTime())) {
        await client.query("commit");
        return null;
      }

      const halfOpenProbe = row.state !== "CLOSED";
      const nextState = halfOpenProbe ? "HALF_OPEN" : "CLOSED";
      const nextLease = halfOpenProbe ? new Date(now.getTime() + halfOpenLeaseMs) : null;
      const updated = await client.query<{version: number}>(
        `update ai_provider_runtime_health
         set state = $5, half_open_lease_until = $6, updated_at = $4, version = version + 1
         where provider_configuration_id = $1 and model_profile_id = $2 and credential_reference_id = $3 and version = $7
         returning version`, [...values, now, nextState, nextLease, row.version],
      );
      if (!updated.rows[0]) throw new AiRuntimeHealthPersistenceError();
      await client.query("commit");
      return Object.freeze({target, version: updated.rows[0].version, halfOpenProbe});
    } catch (error) {
      await rollback(client);
      if (error instanceof RangeError) throw error;
      throw new AiRuntimeHealthPersistenceError();
    } finally { client.release(); }
  }

  async recordSuccess(permit: AiRuntimeHealthPermit, now: Date): Promise<boolean> {
    return this.updatePermit(
      permit,
      `state = 'CLOSED', consecutive_failures = 0, last_success_at = $5, opened_at = null,
       open_until = null, half_open_lease_until = null, updated_at = $5, version = version + 1`,
      now,
    );
  }

  async recordQualifyingFailure(permit: AiRuntimeHealthPermit, now: Date, threshold: number, openDurationMs: number): Promise<boolean> {
    if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 100) throw new RangeError("Circuit threshold must be between 1 and 100.");
    if (!Number.isSafeInteger(openDurationMs) || openDurationMs < 100 || openDurationMs > 3_600_000) throw new RangeError("Circuit duration must be between 100 and 3600000 milliseconds.");
    const values = targetValues(permit.target);
    try {
      const openUntil = new Date(now.getTime() + openDurationMs);
      const result = await this.pool.query(
        `update ai_provider_runtime_health
         set consecutive_failures = consecutive_failures + 1,
             last_failure_at = $5,
             state = case when state = 'HALF_OPEN' or consecutive_failures + 1 >= $6 then 'OPEN' else 'CLOSED' end,
             opened_at = case when state = 'HALF_OPEN' or consecutive_failures + 1 >= $6 then coalesce(opened_at, $5::timestamptz) else null::timestamptz end,
             open_until = case when state = 'HALF_OPEN' or consecutive_failures + 1 >= $6 then $7::timestamptz else null::timestamptz end,
             half_open_lease_until = null,
             updated_at = $5,
             version = version + 1
         where provider_configuration_id = $1 and model_profile_id = $2 and credential_reference_id = $3 and version = $4`,
        [...values, permit.version, now, threshold, openUntil],
      );
      return result.rowCount === 1;
    } catch (error) {
      if (error instanceof RangeError) throw error;
      throw new AiRuntimeHealthPersistenceError();
    }
  }

  async releaseWithoutHealthChange(permit: AiRuntimeHealthPermit, now: Date): Promise<boolean> {
    return this.updatePermit(
      permit,
      `state = case when state = 'HALF_OPEN' then 'OPEN' else state end,
       open_until = case when state = 'HALF_OPEN' then $5 else open_until end,
       half_open_lease_until = null, updated_at = $5, version = version + 1`,
      now,
    );
  }

  async read(target: AiRuntimeHealthTarget): Promise<AiRuntimeHealthSnapshot | null> {
    try {
      const result = await this.pool.query<HealthRow>(
        `select * from ai_provider_runtime_health
         where provider_configuration_id = $1 and model_profile_id = $2 and credential_reference_id = $3`, targetValues(target),
      );
      return result.rows[0] ? toSnapshot(result.rows[0]) : null;
    } catch { throw new AiRuntimeHealthPersistenceError(); }
  }

  private async updatePermit(permit: AiRuntimeHealthPermit, assignment: string, now: Date): Promise<boolean> {
    try {
      const values = targetValues(permit.target);
      const result = await this.pool.query(
        `update ai_provider_runtime_health set ${assignment}
         where provider_configuration_id = $1 and model_profile_id = $2 and credential_reference_id = $3 and version = $4`,
        [...values, permit.version, now],
      );
      return result.rowCount === 1;
    } catch { throw new AiRuntimeHealthPersistenceError(); }
  }
}
