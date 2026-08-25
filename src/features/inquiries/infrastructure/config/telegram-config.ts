export class InvalidTelegramConfigurationError extends Error {
  readonly name = "InvalidTelegramConfigurationError";
}

export type TelegramConfig = Readonly<{
  botToken: string;
  notificationChatId: string;
  webhookSecret: string;
}>;

type TelegramEnvironment = Readonly<Record<string, string | undefined>>;

function required(environment: TelegramEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new InvalidTelegramConfigurationError(`${name} is required when the Telegram adapter is enabled.`);
  return value;
}

export function readTelegramConfig(environment: TelegramEnvironment = process.env): TelegramConfig {
  return Object.freeze({
    botToken: required(environment, "TELEGRAM_BOT_TOKEN"),
    notificationChatId: required(environment, "TELEGRAM_NOTIFICATION_CHAT_ID"),
    webhookSecret: required(environment, "TELEGRAM_WEBHOOK_SECRET"),
  });
}
