import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization, StaffClock} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {principalFromManagementIdentity, type StaffManagementRepository, type StaffManagementTarget} from "@/features/staff-authentication/application/ports/staff-management-ports";
import {parseStaffRole, type StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAccountReference} from "@/features/staff-authentication/domain/value-objects/staff-account-reference";

export type StaffAccountMutationResult = Readonly<{status: "changed" | "not_found" | "unchanged" | "forbidden" | "last_super_admin" | "validation_failed" | "persistence_failed"}>;

function targetForPolicy(target: StaffManagementTarget): Readonly<{staffAccountId: string; role: StaffRole; active: boolean}> {
  return {staffAccountId: target.staffAccountId, role: target.role, active: target.active};
}

export class ChangeStaffRole {
  constructor(private readonly repository: StaffManagementRepository, private readonly authorization: StaffAuthorization, private readonly clock: StaffClock) {}
  async execute(input: Readonly<{principal: StaffPrincipal; targetStaffAccountId: unknown; newRole: unknown}>): Promise<StaffAccountMutationResult> {
    let targetStaffAccountId: string;
    let newRole: StaffRole;
    try { targetStaffAccountId = StaffAccountReference.create(input.targetStaffAccountId).value; newRole = parseStaffRole(input.newRole); }
    catch { return {status: "validation_failed"}; }
    try {
      return {status: await this.repository.changeRole({
        actorStaffAccountId: input.principal.staffAccountId,
        targetStaffAccountId,
        newRole,
        changedAt: this.clock.now(),
        authorize: (actor, target) => this.authorization.mayChangeStaffRole(principalFromManagementIdentity(actor), targetForPolicy(target), newRole),
      })};
    } catch { return {status: "persistence_failed"}; }
  }
}

export class SetStaffActive {
  constructor(private readonly repository: StaffManagementRepository, private readonly authorization: StaffAuthorization, private readonly clock: StaffClock) {}
  async execute(input: Readonly<{principal: StaffPrincipal; targetStaffAccountId: unknown; active: boolean}>): Promise<StaffAccountMutationResult> {
    let targetStaffAccountId: string;
    try { targetStaffAccountId = StaffAccountReference.create(input.targetStaffAccountId).value; }
    catch { return {status: "validation_failed"}; }
    try {
      return {status: await this.repository.setActive({
        actorStaffAccountId: input.principal.staffAccountId,
        targetStaffAccountId,
        active: input.active,
        changedAt: this.clock.now(),
        authorize: (actor, target) => input.active
          ? this.authorization.mayReactivateStaffMember(principalFromManagementIdentity(actor), targetForPolicy(target))
          : this.authorization.mayDeactivateStaffMember(principalFromManagementIdentity(actor), targetForPolicy(target)),
      })};
    } catch { return {status: "persistence_failed"}; }
  }
}
