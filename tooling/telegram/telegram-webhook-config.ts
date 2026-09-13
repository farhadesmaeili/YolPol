import {existsSync} from "node:fs";
import {loadEnvFile} from "node:process";

import {
  readTelegramOutboundConfig,
  readTelegramWebhookConfig,
} from "../../src/features/inquiries/infrastructure/config/telegram-config";

export const telegramWebhookPath = "/api/webhooks/telegram";

type TelegramToolingEnvironment = Readonly<Record<string, string | undefined>>;

export class InvalidTelegramWebhookToolingConfigurationError extends Error {
  readonly name = "InvalidTelegramWebhookToolingConfigurationError";
}

export type TelegramWebhookInfoToolingConfig = Readonly<{
  botToken: string;
  publicOrigin: string;
  webhookUrl: string;
}>;

export type TelegramWebhookSetToolingConfig = TelegramWebhookInfoToolingConfig & Readonly<{
  webhookSecret: string;
}>;

export function loadTelegramWebhookToolingEnvironment(): void {
  const environment = process.env.NODE_ENV === "production" ? "production" : "development";
  const candidates = [`.env.${environment}.local`, ".env.local", `.env.${environment}`, ".env"];
  for (const candidate of candidates) {
    if (existsSync(candidate)) loadEnvFile(candidate);
  }
}

export function normalizeTelegramWebhookPublicOrigin(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new InvalidTelegramWebhookToolingConfigurationError("TELEGRAM_WEBHOOK_PUBLIC_ORIGIN is required.");
  }
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new InvalidTelegramWebhookToolingConfigurationError("TELEGRAM_WEBHOOK_PUBLIC_ORIGIN must be a valid absolute HTTPS origin."); }
  if (
    url.protocol !== "https:"
    || url.origin === "null"
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) {
    throw new InvalidTelegramWebhookToolingConfigurationError("TELEGRAM_WEBHOOK_PUBLIC_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment.");
  }
  return url.origin;
}

export function buildTelegramWebhookUrl(publicOrigin: string): string {
  return new URL(telegramWebhookPath, `${normalizeTelegramWebhookPublicOrigin(publicOrigin)}/`).toString();
}

export function readTelegramWebhookInfoToolingConfig(
  environment: TelegramToolingEnvironment = process.env,
): TelegramWebhookInfoToolingConfig {
  const {botToken} = readTelegramOutboundConfig(environment);
  const publicOrigin = normalizeTelegramWebhookPublicOrigin(environment.TELEGRAM_WEBHOOK_PUBLIC_ORIGIN);
  return Object.freeze({botToken, publicOrigin, webhookUrl: buildTelegramWebhookUrl(publicOrigin)});
}

export function readTelegramWebhookSetToolingConfig(
  environment: TelegramToolingEnvironment = process.env,
): TelegramWebhookSetToolingConfig {
  const info = readTelegramWebhookInfoToolingConfig(environment);
  const {webhookSecret} = readTelegramWebhookConfig(environment);
  return Object.freeze({...info, webhookSecret});
}
