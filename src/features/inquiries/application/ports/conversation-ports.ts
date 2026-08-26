import type {Message} from "@/features/inquiries/domain/entities/message";

export type AppendConversationMessageResult = "created" | "duplicate" | "conversation_not_found";

export interface ConversationMessageWriter {
  appendForInquiry(inquiryId: string, message: Message): Promise<AppendConversationMessageResult>;
}

export interface ConversationMessageReader {
  findForInquiry(inquiryId: string): Promise<readonly Message[] | null>;
}

export type PositionedConversationMessage = Readonly<{position: number; message: Message}>;

export interface ConversationMessageUpdateReader {
  findAfterPositionForInquiry(inquiryId: string, afterPosition: number, limit: number): Promise<readonly PositionedConversationMessage[] | null>;
}

export interface ConversationMessageRepository extends ConversationMessageWriter, ConversationMessageReader, ConversationMessageUpdateReader {}

export interface ConversationReferenceReader {
  findConversationIdForInquiry(inquiryId: string): Promise<string | null>;
}

export interface ConversationMessageIdGenerator { generate(): string; }

export interface StaffReplyMessageIdFactory {
  create(actorReference: string, inquiryId: string, clientMessageId: string): string;
}
