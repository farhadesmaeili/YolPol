import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";
import type {ConversationMessageReader} from "@/features/inquiries/application/ports/conversation-ports";
import type {GetConversationMessageHistoryResult} from "@/features/inquiries/application/results/get-conversation-message-history-result";
import type {Message} from "@/features/inquiries/domain/entities/message";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

function toDto(message: Message): ConversationMessageDto {
  return Object.freeze({
    id: message.id.value,
    senderType: message.senderType,
    channel: message.channel,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  });
}

export class GetConversationMessageHistory {
  constructor(private readonly messages: ConversationMessageReader) {}

  async execute(input: Readonly<{inquiryId: string}>): Promise<GetConversationMessageHistoryResult> {
    let inquiryId: string;
    try {
      inquiryId = InquiryId.create(input.inquiryId).value;
    } catch (error) {
      if (error instanceof InquiryValidationError) return {status: "validation_failed", field: "inquiryId"};
      throw error;
    }

    try {
      const messages = await this.messages.findForInquiry(inquiryId);
      if (messages === null) return {status: "conversation_not_found"};
      return Object.freeze({status: "found", messages: Object.freeze(messages.map(toDto))});
    } catch {
      return {status: "persistence_failed"};
    }
  }
}
