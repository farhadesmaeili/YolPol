import type {StaffAccount} from "@/features/staff-authentication/domain/entities/staff-account";

export type StaffProvisioningPersistenceInput = Readonly<{
  teamMember: Readonly<{id: string; displayName: string}>;
  account: StaffAccount;
}>;

export type StaffProvisioningPersistenceResult =
  | Readonly<{status: "provisioned"; teamMemberCreated: boolean}>
  | Readonly<{status: "inactive_team_member" | "team_member_conflict" | "already_provisioned" | "email_conflict"}>;

export interface StaffProvisioningRepository {
  provision(input: StaffProvisioningPersistenceInput): Promise<StaffProvisioningPersistenceResult>;
}

export interface StaffAccountIdGenerator {
  generate(): string;
}
