export type ReceiveTelegramReplyResult = Readonly<{
  status: "created" | "duplicate" | "unauthorized" | "conversation_not_found" | "invalid_reply" | "persistence_failed";
}>;
