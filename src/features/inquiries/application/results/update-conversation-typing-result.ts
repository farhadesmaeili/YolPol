export type UpdateConversationTypingResult =
  | Readonly<{status: "updated"}>
  | Readonly<{status: "validation_failed"}>
  | Readonly<{status: "dependency_failed"}>;
