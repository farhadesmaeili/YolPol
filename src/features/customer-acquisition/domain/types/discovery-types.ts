export const discoveryStates = ["PENDING_REVIEW", "NEEDS_EVIDENCE", "IDENTITY_CONFLICT", "APPROVED", "REJECTED", "SUPPRESSED", "DUPLICATE"] as const;
export type DiscoveryState = typeof discoveryStates[number];
export type DiscoveryPrincipal = Readonly<{id: string; capability: "INTAKE" | "REVIEW"}>;
export type DiscoveryPolicy = Readonly<{
  key: string; version: string; sourceIdentity: string;
  status: "APPROVED" | "REQUIRES_REVIEW" | "PROHIBITED";
  method: "SYNTHETIC_FIXTURE" | "UNAPPROVED";
  allowedFields: readonly string[]; authority: string; evidenceReference: string;
  reviewedAt: string; effectiveAt: string; expiresAt: string; revoked: boolean; retentionDays: number;
}>;
export type DiscoveryCandidateInput = Readonly<{
  name: string; country: string; domain: string; recordId: string; segment: string;
  url: string; observedAt: string;
}>;
export type DiscoveryBatchInput = Readonly<{
  synthetic: true; idempotencyKey: string; policyKey: string; policyVersion: string;
  method: "SYNTHETIC_FIXTURE"; runReference: string; candidates: readonly DiscoveryCandidateInput[];
}>;
export const evidenceKinds = ["WEBSITE", "SEGMENT", "PACKAGING"] as const;
export type EvidenceInput = Readonly<{
  idempotencyKey: string; expectedVersion: number; kind: typeof evidenceKinds[number];
  finding: "SUPPORTS" | "CONTRADICTS"; url: string; observedAt: string; reference: string;
}>;
export const reviewDecisions = ["APPROVE", "REJECT", "SUPPRESS", "DUPLICATE", "NEEDS_EVIDENCE", "RESOLVE_DISTINCT"] as const;
export type ReviewDecision = typeof reviewDecisions[number];
export type ReviewInput = Readonly<{
  idempotencyKey: string; expectedVersion: number; decision: ReviewDecision;
  reason: "EVIDENCE_REVIEWED" | "INSUFFICIENT_EVIDENCE" | "IDENTITY_REVIEWED" | "MANUAL_SUPPRESSION";
  findingId: string | null;
}>;
export type DiscoveryFinding = "EXACT_DUPLICATE" | "STRONG_CONFLICT" | "POSSIBLE_NAME_MATCH";
export type DiscoveryWriteResult = Readonly<{receiptId: string; batchId?: string; candidateId?: string}>;
export class DiscoveryError extends Error {
  constructor(public readonly code: "INVALID_REQUEST" | "POLICY_DENIED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "EXPIRED" | "SUPPRESSED") {
    super(code); this.name = "DiscoveryError";
  }
}
