import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {deriveStaffActorReference} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAccountReference} from "@/features/staff-authentication/domain/value-objects/staff-account-reference";
import {StaffDisplayName} from "@/features/staff-authentication/domain/value-objects/staff-display-name";

type StaffPrincipalSource = Readonly<{
  staffAccountId: string;
  teamMemberId: string;
  role: StaffRole;
  teamMemberDisplayName: string;
}>;

export function createStaffPrincipal(source: StaffPrincipalSource): StaffPrincipal {
  const accountId = StaffAccountReference.create(source.staffAccountId);
  const displayName = StaffDisplayName.create(source.teamMemberDisplayName);
  return Object.freeze({
    staffAccountId: accountId.value,
    teamMemberId: source.teamMemberId,
    role: source.role,
    displayName: displayName.value,
    actorReference: deriveStaffActorReference(source.teamMemberId),
  });
}
