import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";
import {parseStaffRole} from "@/features/staff-authentication/domain/types/staff-role";

const teamMemberIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;

export function deriveStaffActorReference(teamMemberId: string): string {
  if (!teamMemberIdPattern.test(teamMemberId)) throw new StaffAuthenticationValidationError("Staff team member reference is invalid.");
  return `staff:${teamMemberId}`;
}

export class StaffAuthorizationPolicy implements StaffAuthorization {
  mayPerformTeamOperations(principal: StaffPrincipal): boolean {
    try {
      parseStaffRole(principal.role);
      return principal.actorReference === deriveStaffActorReference(principal.teamMemberId);
    } catch {
      return false;
    }
  }

  mayReplyToCustomerConversation(principal: StaffPrincipal): boolean {
    return this.mayPerformTeamOperations(principal);
  }

  actorReferenceFor(principal: StaffPrincipal): string {
    if (!this.mayPerformTeamOperations(principal)) throw new StaffAuthenticationValidationError("Staff principal is not authorized.");
    return deriveStaffActorReference(principal.teamMemberId);
  }
}
