import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";
import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import type {Message} from "@/features/inquiries/domain/entities/message";

export function toConversationMessageDto(message: Message): ConversationMessageDto {
  return Object.freeze({
    id: message.id.value,
    senderType: message.senderType,
    channel: message.channel,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  });
}

export function toStaffConversationMessageDto(message: Message): StaffConversationMessageDto {
  return Object.freeze({
    ...toConversationMessageDto(message),
    actorReference: message.actorReference?.value ?? null,
  });
}
