import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffTeamManagementDto} from "@/features/staff-authentication/application/dto/staff-management-dto";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {staffRoles} from "@/features/staff-authentication/domain/types/staff-role";
import type {StaffTeamManagementViewModel} from "@/features/staff-authentication/presentation/view-models/staff-team-management-view-model";

export function presentStaffTeamManagement(team: StaffTeamManagementDto, principal: StaffPrincipal, authorization: StaffAuthorization): StaffTeamManagementViewModel {
  const invitationRoles = staffRoles.filter((role): role is Exclude<typeof role, "SUPER_ADMIN"> => role !== "SUPER_ADMIN" && authorization.mayCreateStaffInvitation(principal, role));
  return Object.freeze({
    allowedInvitationRoles: Object.freeze(invitationRoles),
    accounts: Object.freeze(team.accounts.map((account) => {
      const target = {staffAccountId: account.id, role: account.role, active: account.active};
      const mayManageTelegram = authorization.mayDeactivateStaffMember(principal, target);
      return Object.freeze({
        id: account.id,
        displayName: account.displayName,
        email: account.normalizedEmail,
        role: account.role,
        active: account.active,
        createdAt: account.createdAt,
        telegramLinked: account.telegramLinked,
        actions: Object.freeze({
          allowedRoles: Object.freeze(staffRoles.filter((role) => authorization.mayChangeStaffRole(principal, target, role))),
          mayDeactivate: account.active && mayManageTelegram,
          mayReactivate: !account.active && authorization.mayReactivateStaffMember(principal, target),
          mayForceDisconnectTelegram: account.telegramLinked && mayManageTelegram,
          mayRevokeTelegramRequest: mayManageTelegram,
        }),
      });
    })),
    invitations: Object.freeze(team.invitations.map((invitation) => Object.freeze({
      id: invitation.id,
      displayName: invitation.displayName,
      email: invitation.normalizedEmail,
      targetRole: invitation.targetRole,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
      mayRevoke: invitation.status === "ACTIVE" && authorization.mayCreateStaffInvitation(principal, invitation.targetRole),
    }))),
  });
}
