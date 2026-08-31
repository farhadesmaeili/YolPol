import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffCapabilities} from "@/features/staff-authentication/application/dto/staff-capabilities";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";
import {parseStaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

const teamMemberIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;

export function deriveStaffActorReference(teamMemberId: string): string {
  if (!teamMemberIdPattern.test(teamMemberId)) throw new StaffAuthenticationValidationError("Staff team member reference is invalid.");
  return `staff:${teamMemberId}`;
}

export class StaffAuthorizationPolicy implements StaffAuthorization {
  private valid(principal: StaffPrincipal): boolean {
    try {
      parseStaffRole(principal.role);
      return principal.actorReference === deriveStaffActorReference(principal.teamMemberId);
    } catch {
      return false;
    }
  }

  mayAccessStaffPanel(principal: StaffPrincipal): boolean { return this.valid(principal); }
  mayViewInquiries(principal: StaffPrincipal): boolean { return this.valid(principal); }
  mayViewCustomerConversation(principal: StaffPrincipal): boolean { return this.valid(principal); }

  mayReplyToCustomerConversation(principal: StaffPrincipal): boolean {
    return this.valid(principal) && principal.role !== "VIEWER";
  }

  mayPublishStaffTyping(principal: StaffPrincipal): boolean { return this.mayReplyToCustomerConversation(principal); }
  mayUpdateInquiryWorkflow(principal: StaffPrincipal): boolean { return this.mayReplyToCustomerConversation(principal); }
  mayViewAiOperations(principal: StaffPrincipal): boolean { return this.valid(principal); }
  mayManageAiOperations(principal: StaffPrincipal): boolean { return this.valid(principal) && (principal.role === "SUPER_ADMIN" || principal.role === "ADMIN"); }
  mayManageTeam(principal: StaffPrincipal): boolean { return this.valid(principal) && (principal.role === "SUPER_ADMIN" || principal.role === "ADMIN"); }

  mayCreateStaffInvitation(principal: StaffPrincipal, targetRole: StaffRole): boolean {
    if (!this.mayManageTeam(principal) || targetRole === "SUPER_ADMIN") return false;
    return principal.role === "SUPER_ADMIN" || targetRole === "SALES" || targetRole === "VIEWER";
  }

  mayDeactivateStaffMember(principal: StaffPrincipal, target: Readonly<{staffAccountId: string; role: StaffRole; active: boolean}>): boolean {
    return this.mayManageTarget(principal, target);
  }

  mayReactivateStaffMember(principal: StaffPrincipal, target: Readonly<{staffAccountId: string; role: StaffRole; active: boolean}>): boolean {
    return this.mayManageTarget(principal, target);
  }

  mayChangeStaffRole(principal: StaffPrincipal, target: Readonly<{staffAccountId: string; role: StaffRole; active: boolean}>, newRole: StaffRole): boolean {
    if (!this.mayManageTarget(principal, target) || target.role === newRole) return false;
    if (newRole === "SUPER_ADMIN" && !target.active) return false;
    if (principal.role === "SUPER_ADMIN") return true;
    return (target.role === "SALES" || target.role === "VIEWER") && (newRole === "SALES" || newRole === "VIEWER");
  }

  mayAssignAdminRole(principal: StaffPrincipal): boolean { return this.valid(principal) && principal.role === "SUPER_ADMIN"; }
  mayAssignSuperAdminRole(principal: StaffPrincipal): boolean { return this.valid(principal) && principal.role === "SUPER_ADMIN"; }

  capabilitiesFor(principal: StaffPrincipal): StaffCapabilities {
    const mayManageTeam = this.mayManageTeam(principal);
    return Object.freeze({
      mayAccessStaffPanel: this.mayAccessStaffPanel(principal),
      mayViewInquiries: this.mayViewInquiries(principal),
      mayViewCustomerConversation: this.mayViewCustomerConversation(principal),
      mayReplyToCustomerConversation: this.mayReplyToCustomerConversation(principal),
      mayPublishStaffTyping: this.mayPublishStaffTyping(principal),
      mayUpdateInquiryWorkflow: this.mayUpdateInquiryWorkflow(principal),
      mayViewAiOperations: this.mayViewAiOperations(principal),
      mayManageAiOperations: this.mayManageAiOperations(principal),
      mayManageTeam,
      mayCreateStaffInvitation: mayManageTeam,
      mayDeactivateStaffMember: mayManageTeam,
      mayReactivateStaffMember: mayManageTeam,
      mayChangeStaffRole: mayManageTeam,
      mayAssignAdminRole: this.mayAssignAdminRole(principal),
      mayAssignSuperAdminRole: this.mayAssignSuperAdminRole(principal),
    });
  }

  actorReferenceFor(principal: StaffPrincipal): string {
    if (!this.valid(principal)) throw new StaffAuthenticationValidationError("Staff principal is not authorized.");
    return deriveStaffActorReference(principal.teamMemberId);
  }

  private mayManageTarget(principal: StaffPrincipal, target: Readonly<{staffAccountId: string; role: StaffRole; active: boolean}>): boolean {
    if (!this.mayManageTeam(principal) || principal.staffAccountId === target.staffAccountId) return false;
    if (principal.role === "SUPER_ADMIN") return true;
    return target.role === "SALES" || target.role === "VIEWER";
  }
}
