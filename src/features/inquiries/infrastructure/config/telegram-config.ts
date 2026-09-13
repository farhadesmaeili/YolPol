import {readEnvironmentSecretSync} from "@/shared/infrastructure/config/environment-secret";

export class InvalidTelegramConfigurationError extends Error {
  readonly name = "InvalidTelegramConfigurationError";
}

export type TelegramOutboundConfig = Readonly<{botToken: string}>;
export type TelegramWebhookConfig = Readonly<{webhookSecret: string}>;
type TelegramEnvironment = Readonly<Record<string, string | undefined>>;
type SecretFileReader = (path: string) => string;

function required(
  environment: TelegramEnvironment,
  valueVariable: string,
  fileVariable: string,
  readSecretFile?: SecretFileReader,
): string {
  try {
    return readEnvironmentSecretSync({valueVariable, fileVariable}, environment, readSecretFile);
  } catch {
    throw new InvalidTelegramConfigurationError(
      `${valueVariable} or ${fileVariable} must provide one valid secret when the Telegram adapter is enabled.`,
    );
  }
}

export function readTelegramOutboundConfig(
  environment: TelegramEnvironment = process.env,
  readSecretFile?: SecretFileReader,
): TelegramOutboundConfig {
  const botToken = required(environment, "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_TOKEN_FILE", readSecretFile);
  if (!/^[A-Za-z0-9:_-]{1,256}$/u.test(botToken)) throw new InvalidTelegramConfigurationError("TELEGRAM_BOT_TOKEN has an invalid format.");
  return Object.freeze({botToken});
}

export function readTelegramWebhookConfig(
  environment: TelegramEnvironment = process.env,
  readSecretFile?: SecretFileReader,
): TelegramWebhookConfig {
  const webhookSecret = required(environment, "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_WEBHOOK_SECRET_FILE", readSecretFile);
  if (!/^[A-Za-z0-9_-]{1,256}$/u.test(webhookSecret)) throw new InvalidTelegramConfigurationError("TELEGRAM_WEBHOOK_SECRET has an invalid format.");
  return Object.freeze({webhookSecret});
}
