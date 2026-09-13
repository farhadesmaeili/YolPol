import {describe, expect, it, vi} from "vitest";

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

  it("supports separate Docker-Secret-friendly files", () => {
    const readBotToken = vi.fn(() => "123456:file_token\n");
    const readWebhookSecret = vi.fn(() => "file-secret_1\n");
    expect(readTelegramOutboundConfig({TELEGRAM_BOT_TOKEN_FILE: "/run/secrets/telegram_bot_token"}, readBotToken))
      .toEqual({botToken: "123456:file_token"});
    expect(readTelegramWebhookConfig({TELEGRAM_WEBHOOK_SECRET_FILE: "/run/secrets/telegram_webhook_secret"}, readWebhookSecret))
      .toEqual({webhookSecret: "file-secret_1"});
  });

  it.each([
    () => readTelegramOutboundConfig({TELEGRAM_BOT_TOKEN: "direct", TELEGRAM_BOT_TOKEN_FILE: "safe-path"}),
    () => readTelegramOutboundConfig({TELEGRAM_BOT_TOKEN_FILE: "safe-path"}, () => ""),
    () => readTelegramWebhookConfig({TELEGRAM_WEBHOOK_SECRET_FILE: "safe-path"}, () => { throw new Error("sensitive-reader-detail"); }),
  ])("rejects invalid secret source configuration without exposing values or file details", (read) => {
    expect(read).toThrow(InvalidTelegramConfigurationError);
    try { read(); } catch (error) { expect(String(error)).not.toMatch(/direct|safe-path|sensitive-reader-detail/u); }
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
