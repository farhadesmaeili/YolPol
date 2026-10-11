import type {DiscoveryBatchInput, DiscoveryPrincipal, DiscoveryState, DiscoveryWriteResult, EvidenceInput, ReviewInput} from "@/features/customer-acquisition/domain/types/discovery-types";
import type {DiscoveryEligibility} from "@/features/customer-acquisition/domain/services/discovery-eligibility";
// state/version describe immutable decision history, not current authorization.
export type CandidateStatus = Readonly<{id: string; state: DiscoveryState; version: number; expiresAt: string; expired: boolean; suppressed: boolean; policyAllowed: boolean; eligibility: DiscoveryEligibility}>;
export type DiscoveryBatchStatus = Readonly<{batchId: string; candidates: readonly CandidateStatus[]}>;
export type ReviewCandidate = CandidateStatus & Readonly<{
  name: string; country: string; domain: string; segment: string;
  evidence: readonly Readonly<{id: string; kind: string; finding: string; url: string; reference: string; observedAt: string}>[];
  matches: readonly Readonly<{id: string; otherCandidateId: string; kind: string; resolved: boolean}>[];
}>;
export interface DiscoveryRepository {
  submit(principal: DiscoveryPrincipal, input: DiscoveryBatchInput): Promise<DiscoveryWriteResult>;
  batch(principal: DiscoveryPrincipal, id: string): Promise<DiscoveryBatchStatus>;
  queue(after: string | null): Promise<Readonly<{candidates: readonly ReviewCandidate[]; nextCursor: string | null}>>;
  evidence(principal: DiscoveryPrincipal, candidateId: string, input: EvidenceInput): Promise<DiscoveryWriteResult>;
  review(principal: DiscoveryPrincipal, candidateId: string, input: ReviewInput): Promise<DiscoveryWriteResult>;
}
