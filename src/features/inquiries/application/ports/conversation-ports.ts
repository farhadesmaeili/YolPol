import type {Message} from "@/features/inquiries/domain/entities/message";
import type {CustomerMessageAiFallbackJobPlan} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";

export type AppendConversationMessageResult = "created" | "duplicate" | "conversation_not_found";

export interface ConversationMessageWriter {
  appendForInquiry(inquiryId: string, message: Message): Promise<AppendConversationMessageResult>;
}

export interface CustomerWebsiteConversationMessageWriter {
  appendCustomerWebsiteForInquiry(inquiryId: string, message: Message, aiFallbackJob?: CustomerMessageAiFallbackJobPlan | null): Promise<AppendConversationMessageResult>;
}

export interface CorrelatedConversationMessageWriter {
  appendForConversation(conversationId: string, message: Message): Promise<AppendConversationMessageResult>;
}

export interface ConversationMessageReader {
  findForInquiry(inquiryId: string): Promise<readonly Message[] | null>;
}

export type PositionedConversationMessage = Readonly<{position: number; message: Message}>;

export interface PositionedConversationMessageReader {
  findPositionedForInquiry(inquiryId: string): Promise<readonly PositionedConversationMessage[] | null>;
}

export interface ConversationMessageUpdateReader {
  findAfterPositionForInquiry(inquiryId: string, afterPosition: number, limit: number): Promise<readonly PositionedConversationMessage[] | null>;
}

export interface ConversationMessageRepository extends ConversationMessageWriter, ConversationMessageReader, ConversationMessageUpdateReader {}

export interface ConversationReferenceReader {
  findConversationIdForInquiry(inquiryId: string): Promise<string | null>;
}

export interface InquiryNotificationConversationReader extends ConversationReferenceReader {
  findCustomerWebsiteMessage(input: Readonly<{inquiryId: string; conversationId: string; messageId: string}>): Promise<Message | null>;
}

export interface ConversationMessageIdGenerator { generate(): string; }

export interface StaffReplyMessageIdFactory {
  create(actorReference: string, inquiryId: string, clientMessageId: string): string;
}
