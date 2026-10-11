import type {StaffDiscoveryReader, StaffDiscoveryReadResult} from "@/features/customer-acquisition/application/ports/staff-discovery-reader";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";

export type ListStaffDiscoveryResult = StaffDiscoveryReadResult | Readonly<{status: "forbidden"}>;

export class ListStaffDiscoveryCandidates {
  constructor(
    private readonly reader: StaffDiscoveryReader,
    private readonly authorization: Pick<StaffAuthorization, "mayViewDiscoveryCandidates">,
  ) {}

  async execute(principal: StaffPrincipal, cursor: string | null = null): Promise<ListStaffDiscoveryResult> {
    if (!this.authorization.mayViewDiscoveryCandidates(principal)) return {status: "forbidden"};
    try {
      return await this.reader.listCandidates(cursor);
    } catch {
      return {status: "unavailable", reason: "service_failure"};
    }
  }
}
