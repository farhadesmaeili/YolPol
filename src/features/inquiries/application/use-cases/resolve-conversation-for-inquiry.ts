import type {ConversationReferenceReader} from "@/features/inquiries/application/ports/conversation-ports";
import type {ResolveConversationForInquiryResult} from "@/features/inquiries/application/results/resolve-conversation-for-inquiry-result";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

export class ResolveConversationForInquiry {
  constructor(private readonly conversations: ConversationReferenceReader) {}

  async execute(input: Readonly<{inquiryId: string}>): Promise<ResolveConversationForInquiryResult> {
    let inquiryId: string;
    try { inquiryId = InquiryId.create(input.inquiryId).value; }
    catch (error) {
      if (error instanceof InquiryValidationError) return {status: "validation_failed"};
      throw error;
    }

    try {
      const conversationId = await this.conversations.findConversationIdForInquiry(inquiryId);
      return conversationId === null ? {status: "conversation_not_found"} : {status: "resolved", conversationId};
    } catch {
      return {status: "persistence_failed"};
    }
  }
}
