import type {NormalizedInboundChannelText, NormalizedInboundChannelTextInput} from "@/features/conversation-channels/domain/types/conversation-channel-types";
import {parseConversationChannelDate, parseConversationChannelExternalReference, parseConversationChannelProviderKey, parseConversationChannelText, parseExternalConversationChannel} from "@/features/conversation-channels/domain/value-objects/conversation-channel-values";

export class NormalizedInboundChannelMessage {
  private constructor(private readonly value: NormalizedInboundChannelText) {}

  static create(input: NormalizedInboundChannelTextInput): NormalizedInboundChannelMessage {
    return new NormalizedInboundChannelMessage(Object.freeze({
      channel: parseExternalConversationChannel(input.channel),
      providerKey: parseConversationChannelProviderKey(input.providerKey),
      externalAccountReference: parseConversationChannelExternalReference(input.externalAccountReference, "externalAccountReference"),
      externalConversationReference: parseConversationChannelExternalReference(input.externalConversationReference, "externalConversationReference"),
      externalParticipantReference: parseConversationChannelExternalReference(input.externalParticipantReference, "externalParticipantReference"),
      externalMessageReference: parseConversationChannelExternalReference(input.externalMessageReference, "externalMessageReference"),
      body: parseConversationChannelText(input.body),
      occurredAt: parseConversationChannelDate(input.occurredAt, "occurredAt"),
    }));
  }

  toSnapshot(): NormalizedInboundChannelText {
    return Object.freeze({...this.value, occurredAt: new Date(this.value.occurredAt)});
  }
}
