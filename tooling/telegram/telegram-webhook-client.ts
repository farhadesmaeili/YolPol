type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type UnknownRecord = Readonly<Record<string, unknown>>;

const telegramApiOrigin = "https://api.telegram.org";
const maximumResponseCharacters = 64_000;
const defaultTimeoutMilliseconds = 10_000;

export class TelegramWebhookOperationError extends Error {
  readonly name = "TelegramWebhookOperationError";
  constructor() { super("Telegram webhook operation failed."); }
}

export type SetTelegramWebhookInput = Readonly<{
  url: string;
  secretToken: string;
  allowedUpdates: readonly ["message"];
  dropPendingUpdates: false;
}>;

export type TelegramWebhookInfo = Readonly<{
  url: string;
  pendingUpdateCount: number;
  lastErrorDate: number | null;
  lastErrorMessage: string | null;
}>;

export interface TelegramWebhookSetter {
  setWebhook(input: SetTelegramWebhookInput): Promise<void>;
}

export interface TelegramWebhookInfoReader {
  getWebhookInfo(): Promise<TelegramWebhookInfo>;
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
}

function nonNegativeSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export class TelegramWebhookClient implements TelegramWebhookSetter, TelegramWebhookInfoReader {
  constructor(
    private readonly botToken: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly timeoutMilliseconds = defaultTimeoutMilliseconds,
  ) {}

  async setWebhook(input: SetTelegramWebhookInput): Promise<void> {
    const body = await this.call("setWebhook", {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: input.allowedUpdates,
      drop_pending_updates: input.dropPendingUpdates,
    });
    if (body.ok !== true || body.result !== true) throw new TelegramWebhookOperationError();
  }

  async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    const body = await this.call("getWebhookInfo", {});
    const result = record(body.result);
    const pendingUpdateCount = nonNegativeSafeInteger(result?.pending_update_count);
    if (body.ok !== true || !result || typeof result.url !== "string" || pendingUpdateCount === null) {
      throw new TelegramWebhookOperationError();
    }
    const lastErrorDateValue = result.last_error_date;
    const lastErrorMessageValue = result.last_error_message;
    const lastErrorDate = lastErrorDateValue === undefined ? null : nonNegativeSafeInteger(lastErrorDateValue);
    if (lastErrorDateValue !== undefined && lastErrorDate === null) throw new TelegramWebhookOperationError();
    if (lastErrorMessageValue !== undefined && typeof lastErrorMessageValue !== "string") throw new TelegramWebhookOperationError();
    return Object.freeze({
      url: result.url,
      pendingUpdateCount,
      lastErrorDate,
      lastErrorMessage: typeof lastErrorMessageValue === "string" ? lastErrorMessageValue : null,
    });
  }

  private async call(method: "setWebhook" | "getWebhookInfo", payload: UnknownRecord): Promise<UnknownRecord> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      const endpoint = new URL(`/bot${this.botToken}/${method}`, telegramApiOrigin);
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const responseText = await response.text();
      if (!response.ok || responseText.length > maximumResponseCharacters) throw new TelegramWebhookOperationError();
      let parsed: unknown;
      try { parsed = JSON.parse(responseText); }
      catch { throw new TelegramWebhookOperationError(); }
      const body = record(parsed);
      if (!body) throw new TelegramWebhookOperationError();
      return body;
    } catch (error) {
      if (error instanceof TelegramWebhookOperationError) throw error;
      throw new TelegramWebhookOperationError();
    } finally {
      clearTimeout(timeout);
    }
  }
}
