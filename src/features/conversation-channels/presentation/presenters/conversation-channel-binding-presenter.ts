import type {ConversationChannelBindingDto} from "@/features/conversation-channels/application/dto/conversation-channel-dto";
import type {ConversationChannelBindingSnapshot} from "@/features/conversation-channels/domain/types/conversation-channel-types";

export function presentConversationChannelBinding(binding: ConversationChannelBindingSnapshot): ConversationChannelBindingDto {
  return Object.freeze({
    id: binding.id,
    conversationId: binding.conversationId,
    channel: binding.channel,
    providerKey: binding.providerKey,
    externalAccountReference: binding.externalAccountReference,
    externalConversationReference: binding.externalConversationReference,
    externalParticipantReference: binding.externalParticipantReference,
    createdAt: binding.createdAt.toISOString(),
    updatedAt: binding.updatedAt.toISOString(),
  });
}
