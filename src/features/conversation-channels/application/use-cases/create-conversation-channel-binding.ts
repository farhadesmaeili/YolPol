import type {CreateConversationChannelBindingInput} from "@/features/conversation-channels/application/dto/conversation-channel-dto";
import type {ConversationChannelBindingRepository, ConversationChannelClock, ConversationChannelIdGenerator} from "@/features/conversation-channels/application/ports/conversation-channel-ports";
import {ConversationChannelBinding} from "@/features/conversation-channels/domain/entities/conversation-channel-binding";
import {ConversationChannelValidationError} from "@/features/conversation-channels/domain/errors/conversation-channel-errors";

export type CreateConversationChannelBindingResult =
  | Readonly<{status: "created" | "duplicate"; bindingId: string}>
  | Readonly<{status: "validation_failed"; field: string}>
  | Readonly<{status: "conflict" | "conversation_not_found" | "persistence_failed"}>;

export class CreateConversationChannelBinding {
  constructor(
    private readonly bindings: ConversationChannelBindingRepository,
    private readonly ids: ConversationChannelIdGenerator,
    private readonly clock: ConversationChannelClock,
  ) {}

  async execute(input: CreateConversationChannelBindingInput): Promise<CreateConversationChannelBindingResult> {
    try {
      const now = this.clock.now();
      const binding = ConversationChannelBinding.create({
        id: this.ids.generate(),
        conversationId: input.conversationId,
        channel: input.channel,
        providerKey: input.providerKey,
        externalAccountReference: input.externalAccountReference,
        externalConversationReference: input.externalConversationReference,
        externalParticipantReference: input.externalParticipantReference,
        createdAt: now,
        updatedAt: now,
      });
      const result = await this.bindings.save(binding);
      if (result.status === "conflict") return {status: "conflict"};
      if (result.status === "conversation_not_found") return {status: "conversation_not_found"};
      return {status: result.status, bindingId: result.binding.id};
    } catch (error) {
      if (error instanceof ConversationChannelValidationError) return {status: "validation_failed", field: error.field};
      return {status: "persistence_failed"};
    }
  }
}
