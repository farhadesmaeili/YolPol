import type {ConversationChannelClock, ConversationChannelDeliveryRepository, ConversationChannelIdGenerator, ScheduleConversationChannelDeliveryResult} from "@/features/conversation-channels/application/ports/conversation-channel-ports";
import {ConversationChannelValidationError} from "@/features/conversation-channels/domain/errors/conversation-channel-errors";
import {parseConversationChannelInternalId, parseConversationChannelMessageId} from "@/features/conversation-channels/domain/value-objects/conversation-channel-values";

export type ScheduleConversationChannelDeliveryUseCaseResult = ScheduleConversationChannelDeliveryResult
  | Readonly<{status: "validation_failed"; field: string}>
  | Readonly<{status: "persistence_failed"}>;

export class ScheduleConversationChannelDelivery {
  constructor(
    private readonly deliveries: ConversationChannelDeliveryRepository,
    private readonly ids: ConversationChannelIdGenerator,
    private readonly clock: ConversationChannelClock,
  ) {}

  async execute(input: Readonly<{messageId: unknown; bindingId: unknown}>): Promise<ScheduleConversationChannelDeliveryUseCaseResult> {
    try {
      return await this.deliveries.schedule({
        id: parseConversationChannelInternalId(this.ids.generate(), "deliveryId"),
        messageId: parseConversationChannelMessageId(input.messageId),
        bindingId: parseConversationChannelInternalId(input.bindingId, "bindingId"),
        now: this.clock.now(),
      });
    } catch (error) {
      if (error instanceof ConversationChannelValidationError) return {status: "validation_failed", field: error.field};
      return {status: "persistence_failed"};
    }
  }
}
