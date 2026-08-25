import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";

export type ReadNewConversationMessagesResult =
  | Readonly<{status: "found"; updates: readonly ConversationMessageUpdate[]}>
  | Readonly<{status: "conversation_not_found"}>
  | Readonly<{status: "validation_failed"}>
  | Readonly<{status: "persistence_failed"}>;
