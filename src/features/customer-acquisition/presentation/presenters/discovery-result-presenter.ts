import type {DiscoveryBatchStatus, ReviewCandidate} from "@/features/customer-acquisition/application/ports/discovery-repository";
import type {DiscoveryWriteResult} from "@/features/customer-acquisition/domain/types/discovery-types";
export function presentDiscoveryReceipt(result: DiscoveryWriteResult) {
  // Receipts deliberately contain no eligibility state that could become stale on replay.
  return {receiptId: result.receiptId, ...(result.batchId ? {batchId: result.batchId} : {}), ...(result.candidateId ? {candidateId: result.candidateId} : {})};
}
export function presentDiscoveryBatch(result: DiscoveryBatchStatus) {
  return {batchId: result.batchId, candidates: result.candidates.map(c => ({id: c.id, state: c.state, version: c.version, expiresAt: c.expiresAt,
    expired: c.expired, suppressed: c.suppressed, policyAllowed: c.policyAllowed,
    eligibility: {contract: c.eligibility.contract, evaluatedAt: c.eligibility.evaluatedAt, status: c.eligibility.status}}))};
}
export function presentDiscoveryQueue(result: Readonly<{candidates: readonly ReviewCandidate[]; nextCursor: string | null}>) {
  return {nextCursor: result.nextCursor, candidates: result.candidates.map(c => ({...presentDiscoveryBatch({batchId: "", candidates: [c]}).candidates[0],
    name: c.name, country: c.country, domain: c.domain, segment: c.segment,
    evidence: c.evidence.map(e => ({id: e.id, kind: e.kind, finding: e.finding, url: e.url, reference: e.reference, observedAt: e.observedAt})),
    matches: c.matches.map(m => ({id: m.id, otherCandidateId: m.otherCandidateId, kind: m.kind, resolved: m.resolved}))}))};
}
