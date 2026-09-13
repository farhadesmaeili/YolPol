export type StaffProvisioningValidationField = "team_member_id" | "display_name" | "email" | "role" | "password";

export type ProvisionStaffAccountResult =
  | Readonly<{
      status: "provisioned";
      teamMemberCreated: boolean;
      teamMemberId: string;
      displayName: string;
      normalizedEmail: string;
      role: "SUPER_ADMIN" | "ADMIN" | "SALES" | "VIEWER";
    }>
  | Readonly<{status: "validation_failed"; field: StaffProvisioningValidationField}>
  | Readonly<{status: "inactive_team_member" | "team_member_conflict" | "already_provisioned" | "email_conflict"}>
  | Readonly<{status: "persistence_failed" | "dependency_failed"}>;
