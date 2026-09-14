import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import type {NotificationDestinationsDto} from "@/features/notification-destinations/application/dto/notification-destination-dto";
import type {TelegramGroupConnectionRequest} from "@/features/notification-destinations/domain/entities/telegram-group-connection-request";
import type {TelegramGroupChatId} from "@/features/notification-destinations/domain/value-objects/telegram-group";
import type {TelegramUserId} from "@/features/telegram-staff-onboarding/domain/value-objects/telegram-identifiers";

export type NotificationStaffIdentity = Readonly<{
  staffAccountId: string;
  teamMemberId: string;
  role: StaffRole;
  accountActive: boolean;
  teamMemberActive: boolean;
  displayName: string;
}>;

export function principalFromNotificationIdentity(identity: NotificationStaffIdentity): StaffPrincipal {
  return Object.freeze({
    staffAccountId: identity.staffAccountId,
    teamMemberId: identity.teamMemberId,
    role: identity.role,
    displayName: identity.displayName,
    actorReference: `staff:${identity.teamMemberId}`,
  });
}

export type IssuedTelegramGroupToken = Readonly<{requestId: string; credential: string; lookup: string; verification: string}>;
export type PresentedTelegramGroupToken = Readonly<{lookup: string; verification: string}>;

export interface TelegramGroupTokenService {
  issue(): IssuedTelegramGroupToken;
  inspect(credential: string): PresentedTelegramGroupToken | null;
  digestsMatch(actual: string, expected: string): boolean;
}

export interface NotificationDestinationIdGenerator {
  recipientId(): string;
  eventId(): string;
}

export interface NotificationDestinationRepository {
  read(input: Readonly<{
    actorStaffAccountId: string;
    authorizeActor(actor: NotificationStaffIdentity): boolean;
    authorizeTarget(actor: NotificationStaffIdentity, target: NotificationStaffIdentity): boolean;
  }>): Promise<NotificationDestinationsDto | null>;
  setTeamMember(input: Readonly<{
    actorStaffAccountId: string;
    targetStaffAccountId: string;
    enabled: boolean;
    newRecipientId: string;
    eventId: string;
    actorReference: string;
    authorize(actor: NotificationStaffIdentity, target: NotificationStaffIdentity): boolean;
  }>): Promise<"changed" | "unchanged" | "unavailable">;
  createGroupRequest(input: Readonly<{
    request: TelegramGroupConnectionRequest;
    authorizeActor(actor: NotificationStaffIdentity): boolean;
  }>): Promise<"created" | "telegram_not_linked" | "unavailable">;
  revokeGroupRequest(input: Readonly<{
    actorStaffAccountId: string;
    authorizeActor(actor: NotificationStaffIdentity): boolean;
  }>): Promise<"revoked" | "unavailable">;
  consumeGroupRequest(input: Readonly<{
    lookup: string;
    presentedVerification: string;
    senderTelegramUserId: TelegramUserId;
    groupChatId: TelegramGroupChatId;
    displayName: string;
    newRecipientId: string;
    eventId: string;
    digestsMatch(actual: string, expected: string): boolean;
    authorizeActor(actor: NotificationStaffIdentity): boolean;
  }>): Promise<"authorized" | "unavailable">;
  setGroup(input: Readonly<{
    actorStaffAccountId: string;
    recipientId: string;
    operation: "ENABLE" | "DISABLE" | "DISCONNECT";
    eventId: string;
    actorReference: string;
    authorizeActor(actor: NotificationStaffIdentity): boolean;
  }>): Promise<"changed" | "unchanged" | "unavailable">;
}
