export type ResolveConversationByAccessTokenResult =
  | Readonly<{status: "resolved"; conversationId: string; inquiryId: string}>
  | Readonly<{status: "unauthorized"}>
  | Readonly<{status: "persistence_failed"}>
  | Readonly<{status: "dependency_failed"}>;
