import type {ExternalChannelReply} from "@/features/inquiries/application/dto/notification-message";
import {formatInquiryCreatedNotification} from "@/features/inquiries/application/formatters/inquiry-notification-formatter";
import type {CommunicationRecipientRepository, TelegramMessageTransport, TelegramReplyAdapter} from "@/features/inquiries/application/ports/communication-ports";
import type {TelegramNotificationProvider} from "@/features/inquiries/application/ports/inquiry-ports";
import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";

export class TelegramCommunicationAdapter implements TelegramNotificationProvider, TelegramReplyAdapter {
  constructor(
    private readonly recipients: CommunicationRecipientRepository,
    private readonly transport: TelegramMessageTransport,
  ) {}

  async sendInquiryCreated(eventId: string, inquiry: Inquiry): Promise<void> {
    const recipients = await this.recipients.findAuthorizedNotificationRecipients("TELEGRAM");
    const message = formatInquiryCreatedNotification(inquiry);
    await Promise.all(recipients.map((recipient) => this.transport.sendMessage({
      recipientExternalId: recipient.externalId,
      message,
      idempotencyKey: `${eventId}:${recipient.id}`,
    })));
  }

  toExternalChannelReply(input: unknown): ExternalChannelReply | null {
    // Parsing is intentionally deferred until a verified Telegram update contract is introduced.
    void input;
    return null;
  }
}
