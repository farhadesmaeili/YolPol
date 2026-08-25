import type {ExternalChannelReply} from "@/features/inquiries/application/dto/notification-message";
import type {CommunicationRecipientRepository} from "@/features/inquiries/application/ports/communication-ports";
import type {ConversationMessageRepository} from "@/features/inquiries/application/ports/conversation-ports";
import type {Clock} from "@/features/inquiries/application/ports/inquiry-ports";
import type {ReceiveTelegramReplyResult} from "@/features/inquiries/application/results/receive-telegram-reply-result";
import {Message} from "@/features/inquiries/domain/entities/message";
import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";
import {InquiryValidationError} from "@/features/inquiries/domain/errors/inquiry-errors";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

const telegramUpdateIdPattern = /^(?:0|[1-9][0-9]{0,19})$/u;

export class ReceiveTelegramReply {
  constructor(
    private readonly recipients: CommunicationRecipientRepository,
    private readonly messages: ConversationMessageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(reply: ExternalChannelReply): Promise<ReceiveTelegramReplyResult> {
    if (!telegramUpdateIdPattern.test(reply.externalUpdateId)) return {status: "invalid_reply"};

    try {
      const sender = await this.recipients.findAuthorizedTeamMember("TELEGRAM", reply.senderExternalId);
      if (!sender) return {status: "unauthorized"};

      const inquiryId = InquiryId.create(reply.inquiryId).value;
      const now = this.clock.now();
      const message = Message.create({
        id: `telegram_update_${reply.externalUpdateId}`,
        senderType: "INTERNAL_USER",
        channel: "TELEGRAM",
        body: reply.body,
        createdAt: now,
      });
      const result = await this.messages.appendForInquiry(inquiryId, message);
      return {status: result};
    } catch (error) {
      if (error instanceof ConversationValidationError || error instanceof InquiryValidationError) return {status: "invalid_reply"};
      return {status: "persistence_failed"};
    }
  }
}
