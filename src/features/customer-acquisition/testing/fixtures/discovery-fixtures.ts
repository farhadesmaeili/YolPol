import type {DiscoveryBatchInput, DiscoveryCandidateInput, DiscoveryPolicy} from "@/features/customer-acquisition/domain/types/discovery-types";
export const fixturePolicy: DiscoveryPolicy = Object.freeze({key: "synthetic-fixture", version: "fixture-1", sourceIdentity: "fixture",
  status: "APPROVED", method: "SYNTHETIC_FIXTURE", allowedFields: Object.freeze(["name", "country", "domain", "recordId", "segment", "url", "observedAt"]),
  authority: "test-owner", evidenceReference: "test-policy-1", reviewedAt: "2026-10-01T00:00:00.000Z",
  effectiveAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z", revoked: false, retentionDays: 7});
export function fixtureCandidate(index = 1): DiscoveryCandidateInput {
  return {name: `Synthetic Bottler ${index}`, country: "TR", domain: `bottler-${index}.example`, recordId: `record-${index}`,
    segment: "olive-bottler", url: `https://source.example/company-${index}`, observedAt: "2026-10-08T00:00:00.000Z"};
}
export function fixtureBatch(key = "batch-1"): DiscoveryBatchInput {
  return {synthetic: true, idempotencyKey: key, policyKey: fixturePolicy.key, policyVersion: fixturePolicy.version,
    method: "SYNTHETIC_FIXTURE", runReference: "fixture-run", candidates: [fixtureCandidate()]};
}
