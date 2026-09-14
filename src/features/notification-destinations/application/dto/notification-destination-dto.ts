import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

export type NotificationTeamMemberDto = Readonly<{
  staffAccountId: string;
  displayName: string;
  role: StaffRole;
  telegramLinked: boolean;
  authorized: boolean;
  notificationsEnabled: boolean;
  mayManage: boolean;
}>;

export type NotificationGroupDto = Readonly<{
  recipientId: string;
  displayName: string;
  authorized: boolean;
  notificationsEnabled: boolean;
}>;

export type NotificationDestinationAuditEventType =
  | "TEAM_MEMBER_ENABLED"
  | "TEAM_MEMBER_DISABLED"
  | "TEAM_MEMBER_LINK_DISCONNECTED"
  | "TEAM_GROUP_AUTHORIZED"
  | "TEAM_GROUP_ENABLED"
  | "TEAM_GROUP_DISABLED"
  | "TEAM_GROUP_DISCONNECTED";

export type NotificationDestinationAuditEventDto = Readonly<{
  id: string;
  eventType: NotificationDestinationAuditEventType;
  destinationKind: "TEAM_GROUP" | "TEAM_MEMBER";
  displayName: string;
  actorDisplayName: string;
  occurredAt: string;
}>;

export type NotificationDestinationsDto = Readonly<{
  teamMembers: readonly NotificationTeamMemberDto[];
  groups: readonly NotificationGroupDto[];
  auditEvents: readonly NotificationDestinationAuditEventDto[];
  pendingGroupRequestExpiresAt?: string;
  mayCreateGroupRequest: boolean;
}>;
