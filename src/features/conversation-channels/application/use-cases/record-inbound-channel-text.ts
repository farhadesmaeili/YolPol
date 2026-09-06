import type {RecordInboundChannelTextInput} from "@/features/conversation-channels/application/dto/conversation-channel-dto";
import type {ConversationChannelBindingRepository, ConversationChannelClock, ConversationChannelIdGenerator, ConversationChannelInboundRepository, RecordInboundChannelTextResult} from "@/features/conversation-channels/application/ports/conversation-channel-ports";
import {NormalizedInboundChannelMessage} from "@/features/conversation-channels/domain/entities/normalized-inbound-channel-message";
import {ConversationChannelValidationError} from "@/features/conversation-channels/domain/errors/conversation-channel-errors";

export type RecordInboundChannelTextUseCaseResult = RecordInboundChannelTextResult
  | Readonly<{status: "unresolved_binding" | "persistence_failed"}>
  | Readonly<{status: "validation_failed"; field: string}>;

export class RecordInboundChannelText {
  constructor(
    private readonly bindings: ConversationChannelBindingRepository,
    private readonly inbound: ConversationChannelInboundRepository,
    private readonly ids: ConversationChannelIdGenerator,
    private readonly clock: ConversationChannelClock,
  ) {}

  async execute(input: RecordInboundChannelTextInput): Promise<RecordInboundChannelTextUseCaseResult> {
    try {
      const message = NormalizedInboundChannelMessage.create(input).toSnapshot();
      const binding = await this.bindings.findByIdentity(message);
      if (!binding) return {status: "unresolved_binding"};
      return await this.inbound.record({id: this.ids.generate(), binding, message, receivedAt: this.clock.now()});
    } catch (error) {
      if (error instanceof ConversationChannelValidationError) return {status: "validation_failed", field: error.field};
      return {status: "persistence_failed"};
    }
  }
}
