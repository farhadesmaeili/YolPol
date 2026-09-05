import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";

export type GetConversationMessageHistoryResult =
  | Readonly<{status: "found"; messages: readonly (ConversationMessageDto & Readonly<{position?: number}>)[]}>
  | Readonly<{status: "conversation_not_found"}>
  | Readonly<{status: "validation_failed"; field: "inquiryId"}>
  | Readonly<{status: "persistence_failed"}>;
