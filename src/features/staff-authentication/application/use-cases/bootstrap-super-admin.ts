import type {StaffClock} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {StaffManagementRepository} from "@/features/staff-authentication/application/ports/staff-management-ports";
import {StaffAccountReference} from "@/features/staff-authentication/domain/value-objects/staff-account-reference";

export class BootstrapSuperAdmin {
  constructor(private readonly repository: StaffManagementRepository, private readonly clock: StaffClock) {}

  async execute(input: Readonly<{staffAccountId: unknown}>) {
    let staffAccountId: string;
    try { staffAccountId = StaffAccountReference.create(input.staffAccountId).value; }
    catch { return {status: "validation_failed"} as const; }
    try { return {status: await this.repository.bootstrapSuperAdmin({targetStaffAccountId: staffAccountId, changedAt: this.clock.now()})}; }
    catch { return {status: "persistence_failed"} as const; }
  }
}
