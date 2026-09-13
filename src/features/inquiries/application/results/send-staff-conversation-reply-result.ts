import type {StaffConversationReplyDto} from "@/features/inquiries/application/dto/staff-conversation-reply-dto";

export type SendStaffConversationReplyResult =
  | Readonly<{status: "sent"; message: StaffConversationReplyDto; idempotent: boolean}>
  | Readonly<{status: "inquiry_not_found" | "conversation_not_found" | "conflict"}>
  | Readonly<{status: "validation_failed"; field: "inquiryId" | "body" | "clientMessageId"}>
  | Readonly<{status: "persistence_failed" | "dependency_failed"}>;
