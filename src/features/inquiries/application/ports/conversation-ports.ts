import type {Message} from "@/features/inquiries/domain/entities/message";

export type AppendConversationMessageResult = "created" | "duplicate" | "conversation_not_found";

export interface ConversationMessageRepository {
  appendForInquiry(inquiryId: string, message: Message): Promise<AppendConversationMessageResult>;
}

export interface ConversationMessageIdGenerator { generate(): string; }
