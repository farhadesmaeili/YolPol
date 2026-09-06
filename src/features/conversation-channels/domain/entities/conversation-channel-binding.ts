import {ConversationChannelValidationError} from "@/features/conversation-channels/domain/errors/conversation-channel-errors";
import type {ConversationChannelBindingInput, ConversationChannelBindingSnapshot} from "@/features/conversation-channels/domain/types/conversation-channel-types";
import {parseConversationChannelConversationId, parseConversationChannelDate, parseConversationChannelExternalReference, parseConversationChannelInternalId, parseConversationChannelProviderKey, parseExternalConversationChannel} from "@/features/conversation-channels/domain/value-objects/conversation-channel-values";

export class ConversationChannelBinding {
  private constructor(private readonly value: ConversationChannelBindingSnapshot) {}

  static create(input: ConversationChannelBindingInput): ConversationChannelBinding {
    const createdAt = parseConversationChannelDate(input.createdAt, "createdAt");
    const updatedAt = parseConversationChannelDate(input.updatedAt, "updatedAt");
    if (updatedAt < createdAt) throw new ConversationChannelValidationError("updatedAt", "Binding update time cannot predate creation.");
    return new ConversationChannelBinding(Object.freeze({
      id: parseConversationChannelInternalId(input.id, "id"),
      conversationId: parseConversationChannelConversationId(input.conversationId),
      channel: parseExternalConversationChannel(input.channel),
      providerKey: parseConversationChannelProviderKey(input.providerKey),
      externalAccountReference: parseConversationChannelExternalReference(input.externalAccountReference, "externalAccountReference"),
      externalConversationReference: parseConversationChannelExternalReference(input.externalConversationReference, "externalConversationReference"),
      externalParticipantReference: parseConversationChannelExternalReference(input.externalParticipantReference, "externalParticipantReference"),
      createdAt,
      updatedAt,
    }));
  }

  toSnapshot(): ConversationChannelBindingSnapshot {
    return Object.freeze({...this.value, createdAt: new Date(this.value.createdAt), updatedAt: new Date(this.value.updatedAt)});
  }
}
