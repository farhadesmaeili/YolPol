import {NotificationDestinationValidationError} from "@/features/notification-destinations/domain/errors/notification-destination-errors";

export class TelegramGroupChatId {
  private constructor(readonly value: string) {}

  static create(value: unknown): TelegramGroupChatId {
    if (typeof value !== "string" || !/^-[1-9][0-9]{0,15}$/u.test(value)) {
      throw new NotificationDestinationValidationError("Telegram group Chat ID is invalid.");
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new NotificationDestinationValidationError("Telegram group Chat ID is invalid.");
    return new TelegramGroupChatId(value);
  }
}

export function parseTelegramGroupDisplayName(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > 120) {
    throw new NotificationDestinationValidationError("Telegram group display name is invalid.");
  }
  return value;
}
