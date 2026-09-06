import type {ExternalConversationChannel} from "@/features/conversation-channels/domain/types/conversation-channel-types";

export type CreateConversationChannelBindingInput = Readonly<{
  conversationId: unknown;
  channel: unknown;
  providerKey: unknown;
  externalAccountReference: unknown;
  externalConversationReference: unknown;
  externalParticipantReference: unknown;
}>;

export type RecordInboundChannelTextInput = Readonly<{
  channel: unknown;
  providerKey: unknown;
  externalAccountReference: unknown;
  externalConversationReference: unknown;
  externalParticipantReference: unknown;
  externalMessageReference: unknown;
  body: unknown;
  occurredAt: unknown;
}>;

export type ConversationChannelBindingDto = Readonly<{
  id: string;
  conversationId: string;
  channel: ExternalConversationChannel;
  providerKey: string;
  externalAccountReference: string;
  externalConversationReference: string;
  externalParticipantReference: string;
  createdAt: string;
  updatedAt: string;
}>;
