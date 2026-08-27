import type {NotificationMessage} from "@/features/inquiries/application/dto/notification-message";
import type {TelegramDeliveryRepository, TelegramMessageTransport} from "@/features/inquiries/application/ports/communication-ports";
import type {InquiryNotificationConversationReader} from "@/features/inquiries/application/ports/conversation-ports";
import type {Clock, InquiryOutbox, InquiryRepository, PendingInquiryEvent} from "@/features/inquiries/application/ports/inquiry-ports";
import {telegramMaximumAutomaticAttempts, type ClaimedTelegramDelivery, type TelegramProviderResult} from "@/features/inquiries/application/types/telegram-delivery";
import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import type {Message} from "@/features/inquiries/domain/entities/message";

export type ProcessInquiryNotificationsResult = Readonly<{
  claimed: number;
  processed: number;
  scheduledForRetry: number;
  delivered: number;
  permanentFailures: number;
  unknown: number;
}>;

type NotificationFormatter = Readonly<{
  formatInquiryCreated(inquiry: Inquiry): NotificationMessage;
  formatCustomerConversationMessageCreated(inquiry: Inquiry, conversationId: string, message: Message): NotificationMessage;
}>;
type DeliveryCounts = Readonly<{delivered: number; permanentFailures: number; unknown: number}>;
const noRecipientsRetryMilliseconds = 5 * 60_000;
const telegramDeliveryClaimLimit = 100;

function retryDelayMilliseconds(attempts: number): number {
  return Math.min(60 * 60_000, 30_000 * (2 ** Math.min(Math.max(0, attempts - 1), 7)));
}

function retryAt(now: Date, attempts: number, result: Extract<TelegramProviderResult, {status: "retryable_failure"}>): Date {
  const providerDelay = result.retryAfterSeconds === undefined ? 0 : result.retryAfterSeconds * 1_000;
  const delay = Math.max(retryDelayMilliseconds(attempts), Number.isSafeInteger(providerDelay) ? providerDelay : 0);
  return new Date(now.getTime() + delay);
}

export class ProcessInquiryNotifications {
  constructor(
    private readonly outbox: InquiryOutbox,
    private readonly inquiries: InquiryRepository,
    private readonly conversations: InquiryNotificationConversationReader,
    private readonly deliveries: TelegramDeliveryRepository,
    private readonly telegram: TelegramMessageTransport,
    private readonly formatter: NotificationFormatter,
    private readonly clock: Clock,
  ) {}

  async execute(batchSize = 20): Promise<ProcessInquiryNotificationsResult> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new RangeError("Notification worker batch size must be between 1 and 100.");
    let claimed = 0;
    let processed = 0;
    let scheduledForRetry = 0;
    let delivered = 0;
    let permanentFailures = 0;
    let unknown = 0;

    for (let index = 0; index < batchSize; index += 1) {
      const [pending] = await this.outbox.claimPending(1, this.clock.now());
      if (!pending) break;
      claimed += 1;
      const result = await this.processEvent(pending);
      processed += result.processed ? 1 : 0;
      scheduledForRetry += result.processed ? 0 : 1;
      delivered += result.counts.delivered;
      permanentFailures += result.counts.permanentFailures;
      unknown += result.counts.unknown;
    }

    return Object.freeze({claimed, processed, scheduledForRetry, delivered, permanentFailures, unknown});
  }

  private async processEvent(pending: PendingInquiryEvent): Promise<Readonly<{processed: boolean; counts: DeliveryCounts}>> {
    const {event, attempts} = pending;
    const now = this.clock.now();
    const inquiry = await this.inquiries.findById(event.inquiryId);
    if (!inquiry) {
      await this.outbox.scheduleRetry(event.eventId, new Date(now.getTime() + retryDelayMilliseconds(attempts)));
      return {processed: false, counts: {delivered: 0, permanentFailures: 0, unknown: 0}};
    }

    let conversationId: string | null;
    let message: NotificationMessage | null;
    if (event.type === "InquiryCreated") {
      conversationId = await this.conversations.findConversationIdForInquiry(event.inquiryId);
      message = conversationId ? this.formatter.formatInquiryCreated(inquiry) : null;
    } else {
      conversationId = event.conversationId;
      const customerMessage = await this.conversations.findCustomerWebsiteMessage({
        inquiryId: event.inquiryId,
        conversationId: event.conversationId,
        messageId: event.messageId,
      });
      message = customerMessage
        ? this.formatter.formatCustomerConversationMessageCreated(inquiry, event.conversationId, customerMessage)
        : null;
    }
    if (!conversationId || !message) {
      await this.outbox.scheduleRetry(event.eventId, new Date(now.getTime() + retryDelayMilliseconds(attempts)));
      return {processed: false, counts: {delivered: 0, permanentFailures: 0, unknown: 0}};
    }

    const snapshotCount = await this.deliveries.snapshotRecipients({outboxEventId: event.eventId, conversationId, now});
    if (snapshotCount === 0) {
      await this.outbox.scheduleRetry(event.eventId, new Date(now.getTime() + noRecipientsRetryMilliseconds));
      return {processed: false, counts: {delivered: 0, permanentFailures: 0, unknown: 0}};
    }

    const claimedDeliveries = await this.deliveries.claimDue({outboxEventId: event.eventId, limit: telegramDeliveryClaimLimit, now: this.clock.now()});
    const outcomes = await Promise.all(claimedDeliveries.map((delivery) => this.processDelivery(delivery, message)));
    const counts = outcomes.reduce<DeliveryCounts>((total, outcome) => ({
      delivered: total.delivered + (outcome === "delivered" ? 1 : 0),
      permanentFailures: total.permanentFailures + (outcome === "permanent" ? 1 : 0),
      unknown: total.unknown + (outcome === "unknown" ? 1 : 0),
    }), {delivered: 0, permanentFailures: 0, unknown: 0});

    const summary = await this.deliveries.summarizeEvent(event.eventId);
    if (summary.total > 0 && summary.automaticWorkRemaining === 0) {
      await this.outbox.markProcessed(event.eventId, this.clock.now());
      return {processed: true, counts};
    }
    const nextAttemptAt = summary.nextAutomaticWorkAt ?? new Date(this.clock.now().getTime() + retryDelayMilliseconds(attempts));
    await this.outbox.scheduleRetry(event.eventId, nextAttemptAt);
    return {processed: false, counts};
  }

  private async processDelivery(delivery: ClaimedTelegramDelivery, message: NotificationMessage): Promise<"delivered" | "retryable" | "permanent" | "unknown"> {
    let result: TelegramProviderResult;
    try { result = await this.telegram.sendMessage({recipientExternalId: delivery.recipientExternalId, message}); }
    catch { result = {status: "unknown", errorCode: "NETWORK_OUTCOME_UNKNOWN"}; }
    const now = this.clock.now();
    switch (result.status) {
      case "delivered":
        await this.deliveries.markDelivered({delivery, telegramChatId: result.telegramChatId, telegramMessageId: result.telegramMessageId, deliveredAt: now});
        return "delivered";
      case "permanent_failure":
        await this.deliveries.markPermanentFailure({delivery, errorCode: result.errorCode, updatedAt: now});
        return "permanent";
      case "unknown":
        await this.deliveries.markUnknown({delivery, errorCode: result.errorCode, updatedAt: now});
        return "unknown";
      case "retryable_failure":
        if (delivery.attempts >= telegramMaximumAutomaticAttempts) {
          await this.deliveries.markPermanentFailure({delivery, errorCode: "RETRY_EXHAUSTED", updatedAt: now});
          return "permanent";
        }
        await this.deliveries.markRetryable({delivery, errorCode: result.errorCode, availableAt: retryAt(now, delivery.attempts, result), updatedAt: now});
        return "retryable";
    }
  }
}
