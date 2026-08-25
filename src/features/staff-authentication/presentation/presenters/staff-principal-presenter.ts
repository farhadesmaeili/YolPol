import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffPrincipalResponse} from "@/features/staff-authentication/presentation/dto/staff-principal-response";

export function presentStaffPrincipal(principal: StaffPrincipal): StaffPrincipalResponse {
  return Object.freeze({
    staffAccountId: principal.staffAccountId,
    teamMemberId: principal.teamMemberId,
    role: principal.role,
    displayName: principal.displayName,
  });
}

