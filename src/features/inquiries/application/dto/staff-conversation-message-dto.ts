import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";

export type StaffConversationMessageDto = ConversationMessageDto & Readonly<{
  actorReference: string | null;
}>;
