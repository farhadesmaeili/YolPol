import type {ReviewCandidate} from "@/features/customer-acquisition/application/ports/discovery-repository";

export type StaffDiscoveryPage = Readonly<{
  candidates: readonly ReviewCandidate[];
  nextCursor: string | null;
}>;

export type StaffDiscoveryReadResult =
  | Readonly<{status: "available"; page: StaffDiscoveryPage}>
  | Readonly<{status: "unavailable"; reason: "unconfigured" | "service_failure"}>;

export interface StaffDiscoveryReader {
  listCandidates(cursor: string | null): Promise<StaffDiscoveryReadResult>;
}
