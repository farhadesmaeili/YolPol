import {describe, expect, it} from "vitest";

import {InvalidTelegramConfigurationError, readTelegramConfig, readTelegramWebhookConfig} from "@/features/inquiries/infrastructure/config/telegram-config";

describe("Telegram configuration", () => {
  it("reads adapter configuration without transforming secrets", () => {
    expect(readTelegramConfig({TELEGRAM_BOT_TOKEN: "token", TELEGRAM_NOTIFICATION_CHAT_ID: "-100123", TELEGRAM_WEBHOOK_SECRET: "secret"})).toEqual({botToken: "token", notificationChatId: "-100123", webhookSecret: "secret"});
  });

  it("fails closed without exposing configured secret values", () => {
    expect(() => readTelegramConfig({TELEGRAM_BOT_TOKEN: "sensitive-token"})).toThrow(InvalidTelegramConfigurationError);
    try { readTelegramConfig({TELEGRAM_BOT_TOKEN: "sensitive-token"}); } catch (error) { expect(String(error)).not.toContain("sensitive-token"); }
  });

  it("reads webhook configuration without requiring outbound Telegram credentials", () => {
    expect(readTelegramWebhookConfig({TELEGRAM_WEBHOOK_SECRET: "webhook-secret"})).toEqual({webhookSecret: "webhook-secret"});
  });
});
