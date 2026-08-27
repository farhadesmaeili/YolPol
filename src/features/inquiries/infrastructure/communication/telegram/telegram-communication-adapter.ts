import type {NotificationMessage} from "@/features/inquiries/application/dto/notification-message";
import type {TelegramMessageTransport} from "@/features/inquiries/application/ports/communication-ports";
import type {TelegramDeliveryErrorCode, TelegramProviderResult} from "@/features/inquiries/application/types/telegram-delivery";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type UnknownRecord = Readonly<Record<string, unknown>>;
const defaultTimeoutMilliseconds = 10_000;

function record(value: unknown): UnknownRecord | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null; }
function safeInteger(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) ? value : null; }
function retryAfterSeconds(body: UnknownRecord | null): number | undefined {
  const value = safeInteger(record(body?.parameters)?.retry_after);
  return value !== null && value >= 0 ? value : undefined;
}

function errorResult(httpStatus: number, body: UnknownRecord | null): TelegramProviderResult {
  const telegramErrorCode = safeInteger(body?.error_code);
  const effectiveStatus = telegramErrorCode ?? httpStatus;
  if (effectiveStatus === 429) return {status: "retryable_failure", errorCode: "RATE_LIMITED", retryAfterSeconds: retryAfterSeconds(body)};
  if (effectiveStatus >= 500 && effectiveStatus <= 599) return {status: "retryable_failure", errorCode: "TELEGRAM_SERVER_ERROR"};
  if (effectiveStatus === 403) return {status: "permanent_failure", errorCode: "RECIPIENT_FORBIDDEN"};
  const code: TelegramDeliveryErrorCode = effectiveStatus === 400 ? "INVALID_REQUEST"
    : effectiveStatus === 401 ? "INVALID_BOT_TOKEN" : "PROVIDER_ERROR";
  return {status: "retryable_failure", errorCode: code};
}

export class TelegramCommunicationAdapter implements TelegramMessageTransport {
  constructor(private readonly botToken: string, private readonly fetcher: Fetcher = fetch, private readonly timeoutMilliseconds = defaultTimeoutMilliseconds) {}

  async sendMessage(input: Readonly<{recipientExternalId: string; message: NotificationMessage}>): Promise<TelegramProviderResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({chat_id: input.recipientExternalId, text: input.message.text}),
        signal: controller.signal,
      });
      let parsed: unknown;
      try { parsed = JSON.parse(await response.text()); }
      catch { return response.ok ? {status: "unknown", errorCode: "MALFORMED_RESPONSE"} : errorResult(response.status, null); }
      const body = record(parsed);
      if (!response.ok) return errorResult(response.status, body);
      if (body?.ok !== true) {
        return body?.ok === false && safeInteger(body.error_code) !== null
          ? errorResult(response.status, body)
          : {status: "unknown", errorCode: "MALFORMED_RESPONSE"};
      }
      const result = record(body.result);
      const messageId = safeInteger(result?.message_id);
      const chatId = safeInteger(record(result?.chat)?.id);
      if (messageId === null || messageId < 1 || chatId === null) return {status: "unknown", errorCode: "MALFORMED_RESPONSE"};
      return {status: "delivered", telegramChatId: chatId, telegramMessageId: messageId};
    } catch {
      return controller.signal.aborted ? {status: "unknown", errorCode: "TIMEOUT_OUTCOME_UNKNOWN"} : {status: "unknown", errorCode: "NETWORK_OUTCOME_UNKNOWN"};
    } finally { clearTimeout(timeout); }
  }
}
