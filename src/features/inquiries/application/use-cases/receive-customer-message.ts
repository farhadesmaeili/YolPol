import type {ReceiveCustomerMessageInput} from "@/features/inquiries/application/dto/customer-message-dto";
import type {ConversationMessageIdGenerator, CustomerWebsiteConversationMessageWriter} from "@/features/inquiries/application/ports/conversation-ports";
import type {Clock} from "@/features/inquiries/application/ports/inquiry-ports";
import type {ReceiveCustomerMessageResult} from "@/features/inquiries/application/results/receive-customer-message-result";
import {Message} from "@/features/inquiries/domain/entities/message";
import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";
import {normalizeMessageBody} from "@/features/inquiries/domain/validation/message-input-validation";
import type {CustomerMessageAiFallbackPlanner} from "@/features/conversation-ai-routing/application/ports/conversation-ai-routing-ports";

export class ReceiveCustomerMessage {
  constructor(
    private readonly messages: CustomerWebsiteConversationMessageWriter,
    private readonly idGenerator: ConversationMessageIdGenerator,
    private readonly clock: Clock,
    private readonly aiFallback: CustomerMessageAiFallbackPlanner = {plan: async () => null},
  ) {}

  async execute(input: ReceiveCustomerMessageInput): Promise<ReceiveCustomerMessageResult> {
    let inquiryId: string;
    let body: string;
    try {
      inquiryId = InquiryId.create(input.inquiryId).value;
    } catch (error) {
      if (error instanceof InquiryValidationError) return {status: "validation_failed", field: "inquiryId"};
      throw error;
    }
    try {
      body = normalizeMessageBody(input.message);
    } catch (error) {
      if (error instanceof ConversationValidationError) return {status: "validation_failed", field: "message"};
      throw error;
    }

    let message: Message;
    try {
      message = Message.create({
        id: this.idGenerator.generate(),
        senderType: "CUSTOMER",
        channel: "WEBSITE",
        body,
        sourceLocale: input.sourceLocale,
        createdAt: this.clock.now(),
      });
    } catch {
      return {status: "dependency_failed"};
    }

    try {
      let aiFallbackJob = null;
      try { aiFallbackJob = await this.aiFallback.plan({triggerMessageId: message.id.value, triggeredAt: message.createdAt}); }
      catch { aiFallbackJob = null; }
      const result = await this.messages.appendCustomerWebsiteForInquiry(inquiryId, message, aiFallbackJob);
      if (result === "conversation_not_found") return {status: "conversation_not_found"};
      if (result === "duplicate") return {status: "conflict"};
      return {status: "created", messageId: message.id.value};
    } catch {
      return {status: "persistence_failed"};
    }
  }
}
