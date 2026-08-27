import type {
  TelegramWebhookInfoReader,
  TelegramWebhookSetter,
} from "./telegram-webhook-client";
import {
  telegramWebhookPath,
  type TelegramWebhookInfoToolingConfig,
  type TelegramWebhookSetToolingConfig,
} from "./telegram-webhook-config";

export type TelegramWebhookToolingLogger = Readonly<{info(message: string): void}>;

const unsafeControls = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu;
const tokenLikeValue = /\b[0-9]{6,}:[A-Za-z0-9_-]{20,}\b/gu;
const urlLikeValue = /https?:\/\/\S+/giu;
const emailLikeValue = /\b[^\s@]+@[^\s@]+\b/gu;
const maximumLastErrorCharacters = 240;

function redactExact(value: string, secrets: readonly string[]): string {
  return secrets.filter((secret) => secret !== "").reduce((safe, secret) => safe.split(secret).join("[redacted]"), value);
}

function safeLastErrorMessage(value: string, secrets: readonly string[]): string {
  const sanitized = redactExact(value, secrets)
    .replace(urlLikeValue, "[redacted-url]")
    .replace(emailLikeValue, "[redacted-email]")
    .replace(tokenLikeValue, "[redacted-token]")
    .replace(unsafeControls, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (sanitized === "") return "(empty)";
  const characters = [...sanitized];
  return characters.length <= maximumLastErrorCharacters
    ? sanitized
    : `${characters.slice(0, maximumLastErrorCharacters).join("")}…`;
}

function safeRegisteredWebhookUrl(value: string): string {
  if (value === "") return "(not configured)";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username !== ""
      || url.password !== ""
      || url.search !== ""
      || url.hash !== ""
      || url.pathname !== telegramWebhookPath
    ) return "(unsafe URL omitted)";
    return url.toString();
  } catch {
    return "(invalid URL omitted)";
  }
}

export async function runSetTelegramWebhook(input: Readonly<{
  config: TelegramWebhookSetToolingConfig;
  client: TelegramWebhookSetter;
  logger: TelegramWebhookToolingLogger;
}>): Promise<void> {
  await input.client.setWebhook({
    url: input.config.webhookUrl,
    secretToken: input.config.webhookSecret,
    allowedUpdates: ["message"],
    dropPendingUpdates: false,
  });
  input.logger.info("Telegram webhook configured successfully.");
  input.logger.info(`Webhook URL: ${input.config.webhookUrl}`);
  input.logger.info("Pending updates were preserved.");
}

export async function runGetTelegramWebhookInfo(input: Readonly<{
  config: TelegramWebhookInfoToolingConfig;
  client: TelegramWebhookInfoReader;
  logger: TelegramWebhookToolingLogger;
  additionalSensitiveValues?: readonly string[];
}>): Promise<void> {
  const info = await input.client.getWebhookInfo();
  const matches = info.url === input.config.webhookUrl;
  input.logger.info(`Expected webhook URL: ${input.config.webhookUrl}`);
  input.logger.info(`Registered webhook URL: ${safeRegisteredWebhookUrl(info.url)}`);
  input.logger.info(`Webhook status: ${matches ? "MATCH" : "MISMATCH"}`);
  input.logger.info(`Pending update count: ${info.pendingUpdateCount}`);
  if (info.lastErrorDate !== null || info.lastErrorMessage !== null) {
    input.logger.info("");
    input.logger.info("Last recorded delivery error:");
  }
  if (info.lastErrorDate !== null) {
    const lastErrorDate = new Date(info.lastErrorDate * 1_000);
    input.logger.info(`Date: ${Number.isFinite(lastErrorDate.getTime()) ? lastErrorDate.toISOString() : "(invalid date omitted)"}`);
  }
  if (info.lastErrorMessage !== null) {
    input.logger.info(`Message: ${safeLastErrorMessage(info.lastErrorMessage, [
      input.config.botToken,
      ...(input.additionalSensitiveValues ?? []),
    ])}`);
  }
  if (info.lastErrorDate !== null || info.lastErrorMessage !== null) {
    input.logger.info("");
    input.logger.info("Note: Telegram retains the most recently recorded webhook delivery error; this does not by itself indicate a current failure.");
  }
}
