import type {SendStaffConversationReplyInput} from "@/features/inquiries/application/dto/staff-conversation-reply-dto";
import {toStaffConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";
import type {ConversationMessageRepository, StaffReplyMessageIdFactory} from "@/features/inquiries/application/ports/conversation-ports";
import type {Clock, InquiryRepository} from "@/features/inquiries/application/ports/inquiry-ports";
import type {SendStaffConversationReplyResult} from "@/features/inquiries/application/results/send-staff-conversation-reply-result";
import {Message} from "@/features/inquiries/domain/entities/message";
import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {normalizeMessageBody} from "@/features/inquiries/domain/validation/message-input-validation";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";
import {MessageId} from "@/features/inquiries/domain/value-objects/message-id";

type InquiryReader = Pick<InquiryRepository, "findById">;

export class SendStaffConversationReply {
  constructor(
    private readonly inquiries: InquiryReader,
    private readonly messages: ConversationMessageRepository,
    private readonly messageIds: StaffReplyMessageIdFactory,
    private readonly clock: Clock,
  ) {}

  async execute(input: SendStaffConversationReplyInput): Promise<SendStaffConversationReplyResult> {
    let inquiryId: string;
    let body: string;
    let clientMessageId: string;
    try { inquiryId = InquiryId.create(input.inquiryId).value; }
    catch (error) {
      if (error instanceof InquiryValidationError) return {status: "validation_failed", field: "inquiryId"};
      throw error;
    }
    try { body = normalizeMessageBody(input.body); }
    catch (error) {
      if (error instanceof ConversationValidationError) return {status: "validation_failed", field: "body"};
      throw error;
    }
    try { clientMessageId = MessageId.create(input.clientMessageId).value; }
    catch (error) {
      if (error instanceof ConversationValidationError) return {status: "validation_failed", field: "clientMessageId"};
      throw error;
    }

    try {
      if (!await this.inquiries.findById(inquiryId)) return {status: "inquiry_not_found"};
    } catch {
      return {status: "persistence_failed"};
    }

    let message: Message;
    try {
      message = Message.create({
        id: this.messageIds.create(input.actorReference, inquiryId, clientMessageId),
        senderType: "INTERNAL_USER",
        channel: "WEBSITE",
        actorReference: input.actorReference,
        body,
        createdAt: this.clock.now(),
      });
    } catch {
      return {status: "dependency_failed"};
    }

    try {
      const appended = await this.messages.appendForInquiry(inquiryId, message);
      if (appended === "conversation_not_found") return {status: "conversation_not_found"};
      if (appended === "created") {
        return {status: "sent", message: toStaffConversationMessageDto(message), idempotent: false};
      }

      const existing = (await this.messages.findForInquiry(inquiryId))?.find(({id}) => id.value === message.id.value);
      if (
        !existing
        || existing.senderType !== message.senderType
        || existing.channel !== message.channel
        || existing.actorReference?.value !== message.actorReference?.value
        || existing.body !== message.body
      ) {
        return {status: "conflict"};
      }
      return {status: "sent", message: toStaffConversationMessageDto(existing), idempotent: true};
    } catch {
      return {status: "persistence_failed"};
    }
  }
}
