import type {Message} from "@/features/inquiries/domain/entities/message";

export type AppendConversationMessageResult = "created" | "duplicate" | "conversation_not_found";

export interface ConversationMessageWriter {
  appendForInquiry(inquiryId: string, message: Message): Promise<AppendConversationMessageResult>;
}

export interface ConversationMessageReader {
  findForInquiry(inquiryId: string): Promise<readonly Message[] | null>;
}

export interface ConversationMessageRepository extends ConversationMessageWriter, ConversationMessageReader {}

export interface ConversationMessageIdGenerator { generate(): string; }
