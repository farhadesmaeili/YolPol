import {describe, expect, it} from "vitest";

import {InvalidTelegramConfigurationError, readTelegramOutboundConfig, readTelegramWebhookConfig} from "@/features/inquiries/infrastructure/config/telegram-config";

describe("Telegram configuration", () => {
  it("separates outbound and webhook secrets", () => {
    expect(readTelegramOutboundConfig({TELEGRAM_BOT_TOKEN: "123456:test_token"})).toEqual({botToken: "123456:test_token"});
    expect(readTelegramWebhookConfig({TELEGRAM_WEBHOOK_SECRET: "webhook-secret_1"})).toEqual({webhookSecret: "webhook-secret_1"});
  });

  it("does not require a global notification chat or the other integration secret", () => {
    expect(() => readTelegramOutboundConfig({TELEGRAM_BOT_TOKEN: "123456:test_token"})).not.toThrow();
    expect(() => readTelegramWebhookConfig({TELEGRAM_WEBHOOK_SECRET: "secret"})).not.toThrow();
  });

  it.each([
    () => readTelegramOutboundConfig({}),
    () => readTelegramOutboundConfig({TELEGRAM_BOT_TOKEN: "bad/token"}),
    () => readTelegramWebhookConfig({TELEGRAM_WEBHOOK_SECRET: "bad:secret"}),
  ])("rejects invalid configuration without exposing supplied values", (read) => {
    expect(read).toThrow(InvalidTelegramConfigurationError);
    try { read(); } catch (error) { expect(String(error)).not.toMatch(/bad\/token|bad:secret/u); }
  });
});
