import {createHash} from "node:crypto";
import type {Pool} from "pg";
import type {DiscoveryBatchStatus, DiscoveryRepository, ReviewCandidate} from "@/features/customer-acquisition/application/ports/discovery-repository";
import type {DiscoverySourceRegistry} from "@/features/customer-acquisition/application/ports/discovery-source-registry";
import {DiscoveryError, type DiscoveryBatchInput, type DiscoveryPrincipal, type DiscoveryWriteResult, type EvidenceInput, type ReviewInput} from "@/features/customer-acquisition/domain/types/discovery-types";
import {assertDiscoveryPolicy, canonicalDiscoveryPolicy} from "@/features/customer-acquisition/domain/services/discovery-source-policy";
import {discoveryUuid} from "@/features/customer-acquisition/domain/value-objects/discovery-values";
import {parseDiscoveryBatch, parseDiscoveryEvidence, parseDiscoveryReview} from "@/features/customer-acquisition/infrastructure/validation/discovery-input";

export type DiscoveryPools = Readonly<{intake: Pool | null; reviewer: Pool | null}>;

export class PostgresDiscoveryRepository implements DiscoveryRepository {
  constructor(private readonly pools: DiscoveryPools, private readonly registry: DiscoverySourceRegistry) {}

  private async call<T>(pool: Pool | null, statement: string, parameters: readonly unknown[]): Promise<T> {
    if (!pool) throw new DiscoveryError("FORBIDDEN");
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query("begin");
      await client.query("set local lock_timeout = '3s'");
      await client.query("set local statement_timeout = '5s'");
      await client.query("set local transaction_timeout = '8s'");
      const result = await client.query<{result: T}>(statement, [...parameters]);
      await client.query("commit");
      return result.rows[0].result;
    } catch (error) {
      try { await client.query("rollback"); }
      catch { broken = true; throw new Error("Discovery transaction unavailable."); }
      if (error instanceof Error && "code" in error) {
        const codes = ["INVALID_REQUEST", "POLICY_DENIED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "EXPIRED", "SUPPRESSED"] as const;
        const code = codes.find(code => code === error.message);
        if (error.code === "P0001") throw new DiscoveryError(code ?? "CONFLICT");
        if (error.code === "42501") throw new DiscoveryError("FORBIDDEN");
        if (error.code === "23514" || error.code === "23505" || error.code === "23503") throw new DiscoveryError("CONFLICT");
      }
      throw error;
    } finally { client.release(broken); }
  }

  async submit(principal: DiscoveryPrincipal, raw: DiscoveryBatchInput) {
    discoveryUuid(principal.id);
    if (principal.capability !== "INTAKE") throw new DiscoveryError("FORBIDDEN");
    const input = parseDiscoveryBatch(raw);
    const policy = this.registry.find(input.policyKey, input.policyVersion);
    assertDiscoveryPolicy(policy, new Date());
    const fingerprint = createHash("sha256").update(JSON.stringify(canonicalDiscoveryPolicy(policy))).digest("hex");
    return this.call<DiscoveryWriteResult>(this.pools.intake, "select public.acquisition_discovery_submit($1,$2::jsonb,$3) as result", [principal.id, JSON.stringify(input), fingerprint]);
  }
  async batch(principal: DiscoveryPrincipal, id: string) {
    discoveryUuid(principal.id); discoveryUuid(id);
    if (principal.capability !== "INTAKE" && principal.capability !== "REVIEW") throw new DiscoveryError("FORBIDDEN");
    return this.call<DiscoveryBatchStatus>(principal.capability === "INTAKE" ? this.pools.intake : this.pools.reviewer,
      "select public.acquisition_discovery_batch($1,$2) as result", [principal.id, id]);
  }
  async queue(after: string | null) {
    if (after !== null) discoveryUuid(after);
    return this.call<Readonly<{candidates: readonly ReviewCandidate[]; nextCursor: string | null}>>(this.pools.reviewer,
      "select public.acquisition_discovery_queue($1) as result", [after]);
  }
  async evidence(principal: DiscoveryPrincipal, id: string, raw: EvidenceInput) {
    discoveryUuid(principal.id); discoveryUuid(id);
    if (principal.capability !== "REVIEW") throw new DiscoveryError("FORBIDDEN");
    return this.call<DiscoveryWriteResult>(this.pools.reviewer, "select public.acquisition_discovery_evidence($1,$2,$3::jsonb) as result",
      [principal.id, id, JSON.stringify(parseDiscoveryEvidence(raw))]);
  }
  async review(principal: DiscoveryPrincipal, id: string, raw: ReviewInput) {
    discoveryUuid(principal.id); discoveryUuid(id);
    if (principal.capability !== "REVIEW") throw new DiscoveryError("FORBIDDEN");
    return this.call<DiscoveryWriteResult>(this.pools.reviewer, "select public.acquisition_discovery_review($1,$2,$3::jsonb) as result",
      [principal.id, id, JSON.stringify(parseDiscoveryReview(raw))]);
  }
}
