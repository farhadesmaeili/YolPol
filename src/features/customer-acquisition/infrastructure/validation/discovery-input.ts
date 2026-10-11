import {DiscoveryError, evidenceKinds, reviewDecisions, type DiscoveryBatchInput, type EvidenceInput, type ReviewInput} from "@/features/customer-acquisition/domain/types/discovery-types";
import {boundedText, companyNameKey, countryCode, identifier, normalizeDomain, observationTime, requireSyntheticDomain, segmentKey, sourceUrl} from "@/features/customer-acquisition/domain/value-objects/acquisition-values";
import {discoveryUuid, discoveryVersion} from "@/features/customer-acquisition/domain/value-objects/discovery-values";

export function discoveryObject(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DiscoveryError("INVALID_REQUEST");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== required.length || required.some(key => !Object.hasOwn(object, key))) throw new DiscoveryError("INVALID_REQUEST");
  return object;
}
export function parseDiscoveryBatch(value: unknown): DiscoveryBatchInput {
  const v = discoveryObject(value, ["synthetic", "idempotencyKey", "policyKey", "policyVersion", "method", "runReference", "candidates"]);
  if (v.synthetic !== true || v.method !== "SYNTHETIC_FIXTURE" || !Array.isArray(v.candidates) || v.candidates.length < 1 || v.candidates.length > 20) throw new DiscoveryError("INVALID_REQUEST");
  const candidates = v.candidates.map(value => {
    const c = discoveryObject(value, ["name", "country", "domain", "recordId", "segment", "url", "observedAt"]);
    const name = boundedText(c.name, 160); companyNameKey(name);
    return {name, country: countryCode(c.country), domain: requireSyntheticDomain(normalizeDomain(c.domain)), recordId: identifier(c.recordId),
      segment: segmentKey(c.segment), url: sourceUrl(c.url), observedAt: observationTime(c.observedAt)};
  });
  return {synthetic: true, idempotencyKey: identifier(v.idempotencyKey), policyKey: segmentKey(v.policyKey), policyVersion: identifier(v.policyVersion), method: v.method,
    runReference: identifier(v.runReference), candidates};
}
export function parseDiscoveryEvidence(value: unknown): EvidenceInput {
  const v = discoveryObject(value, ["idempotencyKey", "expectedVersion", "kind", "finding", "url", "observedAt", "reference"]);
  const kind = evidenceKinds.find(kind => kind === v.kind);
  if (!kind || (v.finding !== "SUPPORTS" && v.finding !== "CONTRADICTS")) throw new DiscoveryError("INVALID_REQUEST");
  return {idempotencyKey: identifier(v.idempotencyKey), expectedVersion: discoveryVersion(v.expectedVersion), kind, finding: v.finding,
    url: sourceUrl(v.url), observedAt: observationTime(v.observedAt), reference: identifier(v.reference)};
}
export function parseDiscoveryReview(value: unknown): ReviewInput {
  const v = discoveryObject(value, ["idempotencyKey", "expectedVersion", "decision", "reason", "findingId"]);
  const decision = reviewDecisions.find(decision => decision === v.decision);
  const reason = (["EVIDENCE_REVIEWED", "INSUFFICIENT_EVIDENCE", "IDENTITY_REVIEWED", "MANUAL_SUPPRESSION"] as const).find(reason => reason === v.reason);
  if (!decision || !reason) throw new DiscoveryError("INVALID_REQUEST");
  if ((decision === "RESOLVE_DISTINCT" || decision === "DUPLICATE") !== (v.findingId !== null)) throw new DiscoveryError("INVALID_REQUEST");
  return {idempotencyKey: identifier(v.idempotencyKey), expectedVersion: discoveryVersion(v.expectedVersion), decision, reason,
    findingId: v.findingId === null ? null : discoveryUuid(v.findingId)};
}
