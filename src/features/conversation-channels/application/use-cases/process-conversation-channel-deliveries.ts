import type {ConversationChannelClock, ConversationChannelDeliveryRepository, ConversationChannelOutboundAdapter} from "@/features/conversation-channels/application/ports/conversation-channel-ports";
import {parseConversationChannelExternalReference, parseConversationChannelFailureCategory, parseConversationChannelText} from "@/features/conversation-channels/domain/value-objects/conversation-channel-values";

export type ProcessConversationChannelDeliveriesResult = Readonly<{
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
  unknown: number;
  stale: number;
}>;

export class ProcessConversationChannelDeliveries {
  constructor(
    private readonly deliveries: ConversationChannelDeliveryRepository,
    private readonly adapter: ConversationChannelOutboundAdapter,
    private readonly clock: ConversationChannelClock,
    private readonly batchSize = 10,
  ) {}

  async execute(): Promise<ProcessConversationChannelDeliveriesResult> {
    const jobs = await this.deliveries.claimDue({limit: this.batchSize, now: this.clock.now(), leaseMilliseconds: 60_000});
    const counts = {claimed: jobs.length, delivered: 0, retried: 0, failed: 0, unknown: 0, stale: 0};
    for (const job of jobs) {
      // Earlier sends may consume the entire batch lease. Expiry recovery owns
      // these rows; never begin another external side effect with an expired lease.
      if (this.clock.now() >= job.leasedUntil) {
        counts.stale += 1;
        continue;
      }
      let text: string;
      try {
        text = parseConversationChannelText(job.body);
      } catch {
        const saved = await this.deliveries.markFailed({job, category: "INVALID_REQUEST", now: this.clock.now()});
        counts[saved ? "failed" : "stale"] += 1;
        continue;
      }
      try {
        if (!await this.deliveries.isLeaseCurrent({job, now: this.clock.now()}) || this.clock.now() >= job.leasedUntil) {
          counts.stale += 1;
          continue;
        }
        const result = await this.adapter.sendText({
          channel: job.channel,
          providerKey: job.providerKey,
          externalAccountReference: job.externalAccountReference,
          externalConversationReference: job.externalConversationReference,
          externalParticipantReference: job.externalParticipantReference,
          text,
          idempotencyReference: job.id,
        });
        if (result.status === "DELIVERED") {
          const saved = await this.deliveries.markDelivered({job, providerMessageReference: parseConversationChannelExternalReference(result.providerMessageReference, "providerMessageReference"), now: this.clock.now()});
          counts[saved ? "delivered" : "stale"] += 1;
        } else if (result.failureCategory === "UNKNOWN_OUTCOME") {
          const saved = await this.deliveries.markUnknown({job, now: this.clock.now()});
          counts[saved ? "unknown" : "stale"] += 1;
        } else if (result.status === "RETRYABLE_FAILURE") {
          const category = parseConversationChannelFailureCategory(result.failureCategory);
          const now = this.clock.now();
          const delay = Math.min(300_000, 1_000 * (2 ** Math.max(0, job.attempts - 1)));
          const saved = await this.deliveries.markRetryable({job, category, now, availableAt: new Date(now.getTime() + delay)});
          counts[saved === "rescheduled" ? "retried" : saved === "failed" ? "failed" : "stale"] += 1;
        } else if (result.status === "PERMANENT_FAILURE") {
          const saved = await this.deliveries.markFailed({job, category: parseConversationChannelFailureCategory(result.failureCategory), now: this.clock.now()});
          counts[saved ? "failed" : "stale"] += 1;
        } else {
          parseConversationChannelFailureCategory(result.failureCategory);
          const saved = await this.deliveries.markUnknown({job, now: this.clock.now()});
          counts[saved ? "unknown" : "stale"] += 1;
        }
      } catch {
        const saved = await this.deliveries.markUnknown({job, now: this.clock.now()});
        counts[saved ? "unknown" : "stale"] += 1;
      }
    }
    return Object.freeze(counts);
  }
}
