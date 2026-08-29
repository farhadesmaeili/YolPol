import {randomUUID} from "node:crypto";

import type {StaffManagementIdGenerator} from "@/features/staff-authentication/application/ports/staff-management-ports";

export class NodeStaffManagementIdGenerator implements StaffManagementIdGenerator {
  constructor(private readonly randomId: () => string = randomUUID) {}

  accountId(): string { return `staff_${this.randomId().replaceAll("-", "")}`; }
  teamMemberId(): string { return `member_${this.randomId().replaceAll("-", "")}`; }
}
