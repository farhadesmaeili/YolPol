import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

export type StaffTeamAccountViewModel = Readonly<{
  id: string;
  displayName: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  telegramLinked: boolean;
  actions: Readonly<{
    allowedRoles: readonly StaffRole[];
    mayDeactivate: boolean;
    mayReactivate: boolean;
    mayForceDisconnectTelegram: boolean;
    mayRevokeTelegramRequest: boolean;
  }>;
}>;

export type StaffTeamInvitationViewModel = Readonly<{
  id: string;
  displayName: string;
  email: string;
  targetRole: Exclude<StaffRole, "SUPER_ADMIN">;
  createdAt: string;
  expiresAt: string;
  status: "ACTIVE" | "EXPIRED" | "CONSUMED" | "REVOKED";
  mayRevoke: boolean;
}>;

export type StaffTeamManagementViewModel = Readonly<{
  allowedInvitationRoles: readonly Exclude<StaffRole, "SUPER_ADMIN">[];
  accounts: readonly StaffTeamAccountViewModel[];
  invitations: readonly StaffTeamInvitationViewModel[];
}>;
