import {toConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";
import type {ConversationMessageUpdateReader} from "@/features/inquiries/application/ports/conversation-ports";
import type {ReadNewConversationMessagesResult} from "@/features/inquiries/application/results/read-new-conversation-messages-result";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

export const conversationMessageReadBatchLimit = 100;

export class ReadNewConversationMessages {
  constructor(private readonly messages: ConversationMessageUpdateReader) {}

  async execute(input: Readonly<{inquiryId: string; afterCursor: number; limit?: number}>): Promise<ReadNewConversationMessagesResult> {
    let inquiryId: string;
    try { inquiryId = InquiryId.create(input.inquiryId).value; }
    catch (error) {
      if (error instanceof InquiryValidationError) return {status: "validation_failed"};
      throw error;
    }

    const limit = input.limit ?? conversationMessageReadBatchLimit;
    if (!Number.isSafeInteger(input.afterCursor) || input.afterCursor < -1 || !Number.isSafeInteger(limit) || limit < 1 || limit > conversationMessageReadBatchLimit) {
      return {status: "validation_failed"};
    }

    try {
      const messages = await this.messages.findAfterPositionForInquiry(inquiryId, input.afterCursor, limit);
      if (messages === null) return {status: "conversation_not_found"};
      return Object.freeze({
        status: "found",
        updates: Object.freeze(messages.map(({position, message}) => Object.freeze({cursor: position, message: toConversationMessageDto(message)}))),
      });
    } catch {
      return {status: "persistence_failed"};
    }
  }
}
