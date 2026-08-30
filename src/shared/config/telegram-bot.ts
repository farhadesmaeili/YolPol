const telegramBotUsernamePattern = /^[A-Za-z][A-Za-z0-9_]{1,28}[Bb][Oo][Tt]$/u;
const telegramConnectionTokenPattern = /^ypt_[A-Za-z0-9_-]{43}$/u;

export class InvalidPublicTelegramBotConfigurationError extends Error {
  readonly name = "InvalidPublicTelegramBotConfigurationError";
}

export function parsePublicTelegramBotUsername(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || !telegramBotUsernamePattern.test(value)) {
    throw new InvalidPublicTelegramBotConfigurationError("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is invalid.");
  }
  return value;
}

export function readPublicTelegramBotConfig(environment: Readonly<Record<string, string | undefined>> = process.env) {
  return Object.freeze({username: parsePublicTelegramBotUsername(environment.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)});
}

export function buildTelegramStartDeepLink(username: string, connectionToken: string): string {
  const validatedUsername = parsePublicTelegramBotUsername(username);
  if (!telegramConnectionTokenPattern.test(connectionToken)) {
    throw new InvalidPublicTelegramBotConfigurationError("Telegram connection token is invalid.");
  }
  const url = new URL(`https://t.me/${validatedUsername}`);
  url.searchParams.set("start", connectionToken);
  return url.toString();
}
