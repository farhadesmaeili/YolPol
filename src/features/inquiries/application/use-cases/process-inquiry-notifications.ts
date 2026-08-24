import type {Clock, EmailNotificationProvider, InquiryOutbox, InquiryRepository, TelegramNotificationProvider} from "@/features/inquiries/application/ports/inquiry-ports";

export type ProcessInquiryNotificationsResult = Readonly<{claimed: number; processed: number; scheduledForRetry: number}>;

function retryDelayMilliseconds(attempts: number): number {
  return Math.min(60 * 60 * 1_000, 30_000 * (2 ** Math.min(attempts - 1, 7)));
}

export class ProcessInquiryNotifications {
  constructor(
    private readonly outbox: InquiryOutbox,
    private readonly inquiries: InquiryRepository,
    private readonly telegram: TelegramNotificationProvider,
    private readonly email: EmailNotificationProvider,
    private readonly clock: Clock,
  ) {}

  async execute(batchSize = 20): Promise<ProcessInquiryNotificationsResult> {
    const now = this.clock.now();
    const pending = await this.outbox.claimPending(batchSize, now);
    let processed = 0;
    for (const {event, attempts} of pending) {
      const inquiry = await this.inquiries.findById(event.inquiryId);
      if (!inquiry) {
        await this.outbox.scheduleRetry(event.eventId, new Date(now.getTime() + retryDelayMilliseconds(attempts)));
        continue;
      }
      const deliveries = await Promise.allSettled([
        this.telegram.sendInquiryCreated(event.eventId, inquiry),
        this.email.sendInquiryCreated(event.eventId, inquiry),
      ]);
      if (deliveries.every(({status}) => status === "fulfilled")) {
        await this.outbox.markProcessed(event.eventId, this.clock.now());
        processed += 1;
      } else {
        await this.outbox.scheduleRetry(event.eventId, new Date(now.getTime() + retryDelayMilliseconds(attempts)));
      }
    }
    return Object.freeze({claimed: pending.length, processed, scheduledForRetry: pending.length - processed});
  }
}
