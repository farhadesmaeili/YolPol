import type {ExternalChannelReply, NotificationMessage} from "@/features/inquiries/application/dto/notification-message";

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
}>;

export interface CommunicationRecipientRepository {
  findAuthorizedNotificationRecipients(channel: CommunicationChannel): Promise<readonly CommunicationRecipient[]>;
}

export interface TelegramMessageTransport {
  sendMessage(input: Readonly<{recipientExternalId: string; message: NotificationMessage; idempotencyKey: string}>): Promise<void>;
}

export interface TelegramReplyAdapter {
  toExternalChannelReply(input: unknown): ExternalChannelReply | null;
}
