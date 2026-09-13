export const telegramDeliveryStatuses = [
  "PENDING",
  "IN_FLIGHT",
  "RETRYABLE_FAILURE",
  "DELIVERED",
  "PERMANENT_FAILURE",
  "UNKNOWN",
] as const;

export type TelegramDeliveryStatus = (typeof telegramDeliveryStatuses)[number];

export const telegramTerminalDeliveryStatuses = ["DELIVERED", "PERMANENT_FAILURE", "UNKNOWN"] as const;
export type TelegramTerminalDeliveryStatus = (typeof telegramTerminalDeliveryStatuses)[number];

export const telegramDeliveryErrorCodes = [
  "RATE_LIMITED",
  "TELEGRAM_SERVER_ERROR",
  "INVALID_REQUEST",
  "INVALID_BOT_TOKEN",
  "RECIPIENT_FORBIDDEN",
  "PROVIDER_ERROR",
  "NETWORK_OUTCOME_UNKNOWN",
  "TIMEOUT_OUTCOME_UNKNOWN",
  "MALFORMED_RESPONSE",
  "WORKER_OUTCOME_UNKNOWN",
  "RETRY_EXHAUSTED",
] as const;

export type TelegramDeliveryErrorCode = (typeof telegramDeliveryErrorCodes)[number];

export const telegramMaximumAutomaticAttempts = 5;

export type ClaimedTelegramDelivery = Readonly<{
  outboxEventId: string;
  recipientId: string;
  conversationId: string;
  recipientKind: "TEAM_GROUP" | "TEAM_MEMBER";
  recipientExternalId: string;
  attempts: number;
}>;

export type TelegramDeliveryEventSummary = Readonly<{
  total: number;
  automaticWorkRemaining: number;
  nextAutomaticWorkAt: Date | null;
  delivered: number;
  permanentFailures: number;
  unknown: number;
}>;

export type TelegramProviderResult =
  | Readonly<{status: "delivered"; telegramChatId: number; telegramMessageId: number}>
  | Readonly<{status: "retryable_failure"; errorCode: TelegramDeliveryErrorCode; retryAfterSeconds?: number}>
  | Readonly<{status: "permanent_failure"; errorCode: TelegramDeliveryErrorCode}>
  | Readonly<{status: "unknown"; errorCode: TelegramDeliveryErrorCode}>;
