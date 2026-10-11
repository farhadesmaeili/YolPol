import type {StaffDiscoveryReader, StaffDiscoveryReadResult} from "@/features/customer-acquisition/application/ports/staff-discovery-reader";

export class UnconfiguredStaffDiscoveryReader implements StaffDiscoveryReader {
  async listCandidates(): Promise<StaffDiscoveryReadResult> {
    return {status: "unavailable", reason: "unconfigured"};
  }
}
