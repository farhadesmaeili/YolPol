import type {CandidateStatus} from "@/features/customer-acquisition/application/ports/discovery-repository";

// Only the fields rendered by Staff cross the restricted read boundary.
export type StaffDiscoveryCandidate = CandidateStatus & Readonly<{
  name: string; country: string; domain: string; segment: string;
  evidence: readonly Readonly<{id: string; kind: string; finding: string}>[];
  matches: readonly Readonly<{id: string; kind: string; resolved: boolean}>[];
}>;

export type StaffDiscoveryPage = Readonly<{
  candidates: readonly StaffDiscoveryCandidate[];
  nextCursor: string | null;
}>;

export type StaffDiscoveryReadResult =
  | Readonly<{status: "available"; page: StaffDiscoveryPage}>
  | Readonly<{status: "unavailable"; reason: "unconfigured" | "service_failure"}>;

export interface StaffDiscoveryReader {
  listCandidates(cursor: string | null): Promise<StaffDiscoveryReadResult>;
}
