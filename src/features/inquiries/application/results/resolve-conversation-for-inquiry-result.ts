export type ResolveConversationForInquiryResult =
  | Readonly<{status: "resolved"; conversationId: string}>
  | Readonly<{status: "conversation_not_found"}>
  | Readonly<{status: "validation_failed"}>
  | Readonly<{status: "persistence_failed"}>;
