import type {ConversationChannel, MessageSenderType} from "@/features/inquiries/domain/types/conversation-types";

export type ConversationMessageDto = Readonly<{
  id: string;
  senderType: MessageSenderType;
  channel: ConversationChannel;
  body: string;
  createdAt: string;
}>;
