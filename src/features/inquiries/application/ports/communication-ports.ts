import type {ExternalChannelReply, NotificationMessage} from "@/features/inquiries/application/dto/notification-message";
import type {ClaimedTelegramDelivery, TelegramDeliveryErrorCode, TelegramDeliveryEventSummary, TelegramProviderResult} from "@/features/inquiries/application/types/telegram-delivery";

export const communicationChannels = ["TELEGRAM", "EMAIL", "WHATSAPP"] as const;
export type CommunicationChannel = (typeof communicationChannels)[number];
export const communicationRecipientKinds = ["TEAM_GROUP", "TEAM_MEMBER"] as const;
export type CommunicationRecipientKind = (typeof communicationRecipientKinds)[number];

export type CommunicationRecipient = Readonly<{
  id: string;
  channel: CommunicationChannel;
  kind: CommunicationRecipientKind;
  externalId: string;
  displayName: string;
  teamMemberId: string | null;
  teamMemberActive: boolean | null;
}>;

export interface CommunicationRecipientRepository {
  findAuthorizedNotificationRecipients(channel: CommunicationChannel): Promise<readonly CommunicationRecipient[]>;
  findAuthorizedTeamMember(channel: CommunicationChannel, externalId: string): Promise<CommunicationRecipient | null>;
}

export interface TelegramDeliveryRepository {
  snapshotRecipients(input: Readonly<{outboxEventId: string; conversationId: string; now: Date}>): Promise<number>;
  claimDue(input: Readonly<{outboxEventId: string; limit: number; now: Date}>): Promise<readonly ClaimedTelegramDelivery[]>;
  markDelivered(input: Readonly<{delivery: ClaimedTelegramDelivery; telegramChatId: number; telegramMessageId: number; deliveredAt: Date}>): Promise<void>;
  markRetryable(input: Readonly<{delivery: ClaimedTelegramDelivery; errorCode: TelegramDeliveryErrorCode; availableAt: Date; updatedAt: Date}>): Promise<void>;
  markPermanentFailure(input: Readonly<{delivery: ClaimedTelegramDelivery; errorCode: TelegramDeliveryErrorCode; updatedAt: Date}>): Promise<void>;
  markUnknown(input: Readonly<{delivery: ClaimedTelegramDelivery; errorCode: TelegramDeliveryErrorCode; updatedAt: Date}>): Promise<void>;
  summarizeEvent(outboxEventId: string): Promise<TelegramDeliveryEventSummary>;
  findConversationByProviderMessage(input: Readonly<{telegramChatId: number; telegramMessageId: number}>): Promise<Readonly<{conversationId: string}> | null>;
}

export interface TelegramMessageTransport {
  sendMessage(input: Readonly<{recipientExternalId: string; message: NotificationMessage}>): Promise<TelegramProviderResult>;
}

export interface TelegramReplyAdapter {
  toExternalChannelReply(input: unknown): ExternalChannelReply | null;
}
