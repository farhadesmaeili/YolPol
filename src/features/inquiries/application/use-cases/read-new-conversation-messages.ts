import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";
import type {ConversationMessageUpdateReader} from "@/features/inquiries/application/ports/conversation-ports";
import type {ReadNewConversationMessagesResult} from "@/features/inquiries/application/results/read-new-conversation-messages-result";
import type {Message} from "@/features/inquiries/domain/entities/message";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

export const conversationMessageReadBatchLimit = 100;

export class ReadNewConversationMessages<TMessage extends ConversationMessageDto> {
  constructor(
    private readonly messages: ConversationMessageUpdateReader,
    private readonly toDto: (message: Message) => TMessage,
  ) {}

  async execute(input: Readonly<{inquiryId: string; afterCursor: number; limit?: number}>): Promise<ReadNewConversationMessagesResult<TMessage>> {
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
        updates: Object.freeze(messages.map(({position, message}) => Object.freeze({cursor: position, message: this.toDto(message)}))),
      });
    } catch {
      return {status: "persistence_failed"};
    }
  }
}
