import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffTeamManagementDto} from "@/features/staff-authentication/application/dto/staff-management-dto";
import type {StaffAuthorization, StaffClock} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {StaffManagementRepository} from "@/features/staff-authentication/application/ports/staff-management-ports";

export class ListStaffTeam {
  constructor(private readonly repository: StaffManagementRepository, private readonly authorization: StaffAuthorization, private readonly clock: StaffClock) {}

  async execute(principal: StaffPrincipal): Promise<Readonly<{status: "found"; team: StaffTeamManagementDto}> | Readonly<{status: "forbidden" | "persistence_failed"}>> {
    if (!this.authorization.mayManageTeam(principal)) return {status: "forbidden"};
    try {
      const [accounts, invitations] = await Promise.all([this.repository.listAccounts(), this.repository.listInvitations(this.clock.now())]);
      return {status: "found", team: Object.freeze({accounts, invitations})};
    } catch { return {status: "persistence_failed"}; }
  }
}
