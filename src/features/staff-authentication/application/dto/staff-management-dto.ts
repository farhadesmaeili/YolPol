import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

export type StaffAccountSummaryDto = Readonly<{
  id: string;
  displayName: string;
  normalizedEmail: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  telegramLinked: boolean;
}>;

export type StaffInvitationSummaryDto = Readonly<{
  id: string;
  displayName: string;
  normalizedEmail: string;
  targetRole: Exclude<StaffRole, "SUPER_ADMIN">;
  createdAt: string;
  expiresAt: string;
  status: "ACTIVE" | "EXPIRED" | "CONSUMED" | "REVOKED";
}>;

export type StaffTeamManagementDto = Readonly<{
  accounts: readonly StaffAccountSummaryDto[];
  invitations: readonly StaffInvitationSummaryDto[];
}>;
