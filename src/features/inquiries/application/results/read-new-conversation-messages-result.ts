import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";
import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";

export type ReadNewConversationMessagesResult<TMessage extends ConversationMessageDto = ConversationMessageDto> =
  | Readonly<{status: "found"; updates: readonly ConversationMessageUpdate<TMessage>[]}>
  | Readonly<{status: "conversation_not_found"}>
  | Readonly<{status: "validation_failed"}>
  | Readonly<{status: "persistence_failed"}>;
