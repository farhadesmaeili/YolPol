import {toConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";
import type {ConversationMessageReader} from "@/features/inquiries/application/ports/conversation-ports";
import type {GetConversationMessageHistoryResult} from "@/features/inquiries/application/results/get-conversation-message-history-result";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

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
      if (this.messages.findPositionedForInquiry) {
        const rows = await this.messages.findPositionedForInquiry(inquiryId);
        if (rows === null) return {status: "conversation_not_found"};
        return {status: "found", messages: rows.map(({message, position}) => ({...toConversationMessageDto(message), position}))};
      }
      const messages = await this.messages.findForInquiry(inquiryId);
      if (messages === null) return {status: "conversation_not_found"};
      return Object.freeze({status: "found", messages: Object.freeze(messages.map(toConversationMessageDto))});
    } catch {
      return {status: "persistence_failed"};
    }
  }
}
