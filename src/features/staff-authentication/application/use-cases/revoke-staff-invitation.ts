import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization, StaffClock} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {principalFromManagementIdentity, type StaffManagementRepository} from "@/features/staff-authentication/application/ports/staff-management-ports";
import {StaffAccountReference} from "@/features/staff-authentication/domain/value-objects/staff-account-reference";

export class RevokeStaffInvitation {
  constructor(private readonly repository: StaffManagementRepository, private readonly authorization: StaffAuthorization, private readonly clock: StaffClock) {}
  async execute(input: Readonly<{principal: StaffPrincipal; invitationId: unknown}>) {
    let invitationId: string;
    try { invitationId = StaffAccountReference.create(input.invitationId).value; }
    catch { return {status: "validation_failed"} as const; }
    try {
      return {status: await this.repository.revokeInvitation({
        actorStaffAccountId: input.principal.staffAccountId,
        invitationId,
        revokedAt: this.clock.now(),
        authorize: (actor, targetRole) => this.authorization.mayCreateStaffInvitation(principalFromManagementIdentity(actor), targetRole),
      })};
    } catch { return {status: "persistence_failed"} as const; }
  }
}
