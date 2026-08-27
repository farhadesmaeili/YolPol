export class InvalidTelegramConfigurationError extends Error {
  readonly name = "InvalidTelegramConfigurationError";
}

export type TelegramOutboundConfig = Readonly<{botToken: string}>;
export type TelegramWebhookConfig = Readonly<{webhookSecret: string}>;
type TelegramEnvironment = Readonly<Record<string, string | undefined>>;

function required(environment: TelegramEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new InvalidTelegramConfigurationError(`${name} is required when the Telegram adapter is enabled.`);
  return value;
}

export function readTelegramOutboundConfig(environment: TelegramEnvironment = process.env): TelegramOutboundConfig {
  const botToken = required(environment, "TELEGRAM_BOT_TOKEN");
  if (!/^[A-Za-z0-9:_-]{1,256}$/u.test(botToken)) throw new InvalidTelegramConfigurationError("TELEGRAM_BOT_TOKEN has an invalid format.");
  return Object.freeze({botToken});
}

export function readTelegramWebhookConfig(environment: TelegramEnvironment = process.env): TelegramWebhookConfig {
  const webhookSecret = required(environment, "TELEGRAM_WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_-]{1,256}$/u.test(webhookSecret)) throw new InvalidTelegramConfigurationError("TELEGRAM_WEBHOOK_SECRET has an invalid format.");
  return Object.freeze({webhookSecret});
}
