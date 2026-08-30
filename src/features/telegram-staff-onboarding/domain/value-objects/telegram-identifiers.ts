import {TelegramStaffOnboardingValidationError} from "@/features/telegram-staff-onboarding/domain/errors/telegram-staff-onboarding-errors";

const positiveBigintPattern = /^[1-9][0-9]{0,18}$/u;
const postgresBigintMaximum = BigInt("9223372036854775807");

function parsePositivePostgresBigint(value: unknown, label: string): string {
  if (typeof value !== "string" || !positiveBigintPattern.test(value)) {
    throw new TelegramStaffOnboardingValidationError(`${label} must be a positive decimal string.`);
  }
  try {
    if (BigInt(value) > postgresBigintMaximum) throw new Error("out of range");
  } catch {
    throw new TelegramStaffOnboardingValidationError(`${label} is outside the PostgreSQL bigint range.`);
  }
  return value;
}

export class TelegramUserId {
  private constructor(readonly value: string) {}

  static create(value: unknown): TelegramUserId {
    return new TelegramUserId(parsePositivePostgresBigint(value, "Telegram User ID"));
  }
}

export class TelegramPrivateChatId {
  private constructor(readonly value: string) {}

  static create(value: unknown): TelegramPrivateChatId {
    return new TelegramPrivateChatId(parsePositivePostgresBigint(value, "Telegram private Chat ID"));
  }
}
