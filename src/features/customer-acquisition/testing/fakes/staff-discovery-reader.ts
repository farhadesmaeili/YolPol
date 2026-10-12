import type {ReviewCandidate} from "@/features/customer-acquisition/application/ports/discovery-repository";
import type {StaffDiscoveryReader, StaffDiscoveryReadResult} from "@/features/customer-acquisition/application/ports/staff-discovery-reader";

export function syntheticReviewCandidate(index = 1, changes: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Synthetic Bottler ${index}`,
    country: "TR",
    domain: `bottler-${index}.example`,
    segment: "glass-packaging",
    state: "PENDING_REVIEW",
    version: 1,
    expiresAt: "2026-10-15T00:00:00.000Z",
    expired: false,
    suppressed: false,
    policyAllowed: true,
    eligibility: {contract: "authorization-time-v1", evaluatedAt: "2026-10-10T00:00:00.000Z", status: "EVIDENCE_REQUIRED"},
    evidence: [
      {id: "synthetic-evidence-source", kind: "SOURCE", finding: "OBSERVED", url: "https://source.example/company-1", reference: "synthetic-source-1", observedAt: "2026-10-09T00:00:00.000Z"},
      {id: "synthetic-evidence-support", kind: "WEBSITE", finding: "SUPPORTS", url: "https://source.example/company-1", reference: "synthetic-support-1", observedAt: "2026-10-09T00:00:00.000Z"},
      {id: "synthetic-evidence-contradiction", kind: "WEBSITE", finding: "CONTRADICTS", url: "https://source.example/company-1", reference: "synthetic-contradiction-1", observedAt: "2026-10-09T00:00:00.000Z"},
    ],
    matches: [{id: "synthetic-finding-1", otherCandidateId: "00000000-0000-4000-8000-000000000099", kind: "POSSIBLE_NAME_MATCH", resolved: false}],
    ...changes,
  };
}

export class FakeStaffDiscoveryReader implements StaffDiscoveryReader {
  readonly calls: Array<string | null> = [];
  constructor(private readonly pages: ReadonlyMap<string | null, StaffDiscoveryReadResult>) {}

  async listCandidates(cursor: string | null): Promise<StaffDiscoveryReadResult> {
    this.calls.push(cursor);
    return this.pages.get(cursor) ?? {status: "unavailable", reason: "service_failure"};
  }
}
