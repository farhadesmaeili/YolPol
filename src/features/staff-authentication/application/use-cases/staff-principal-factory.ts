import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {deriveStaffActorReference} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

const referencePattern = /^[A-Za-z0-9_-]{1,128}$/u;

type StaffPrincipalSource = Readonly<{
  staffAccountId: string;
  teamMemberId: string;
  role: StaffRole;
  teamMemberDisplayName: string;
}>;

export function createStaffPrincipal(source: StaffPrincipalSource): StaffPrincipal {
  if (!referencePattern.test(source.staffAccountId)) throw new StaffAuthenticationValidationError("Staff account reference is invalid.");
  const displayName = source.teamMemberDisplayName.trim();
  if (displayName.length < 1 || displayName.length > 120 || /[\u0000-\u001F\u007F]/u.test(displayName)) {
    throw new StaffAuthenticationValidationError("Staff display name is invalid.");
  }
  return Object.freeze({
    staffAccountId: source.staffAccountId,
    teamMemberId: source.teamMemberId,
    role: source.role,
    displayName,
    actorReference: deriveStaffActorReference(source.teamMemberId),
  });
}
