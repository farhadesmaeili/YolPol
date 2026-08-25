import {randomUUID} from "node:crypto";

import type {StaffAccountIdGenerator} from "@/features/staff-authentication/application/ports/staff-provisioning-ports";

export class NodeStaffAccountIdGenerator implements StaffAccountIdGenerator {
  constructor(private readonly randomId: () => string = randomUUID) {}

  generate(): string {
    return `staff_${this.randomId().replaceAll("-", "")}`;
  }
}
