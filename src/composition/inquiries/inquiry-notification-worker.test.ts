import type {Pool, PoolConfig} from "pg";
import {describe, expect, it, vi} from "vitest";

import {createInquiryNotificationWorker} from "@/composition/inquiries/inquiry-notification-worker";
import {readTelegramOutboundConfig} from "@/features/inquiries/infrastructure/config/telegram-config";

const postgresConfig: PoolConfig = Object.freeze({
  connectionString: "postgresql://worker:local-test@example.test/yolpol",
});

describe("createInquiryNotificationWorker", () => {
  it.each([undefined, "bad/token"])("rejects Telegram configuration %j before pool construction", (botToken) => {
    const createPool = vi.fn<(config: PoolConfig) => Pool>();

    expect(() => createInquiryNotificationWorker({
      readPostgresConfiguration: () => postgresConfig,
      readTelegramConfiguration: () => readTelegramOutboundConfig({TELEGRAM_BOT_TOKEN: botToken}),
      createPool,
    })).toThrow();

    expect(createPool).not.toHaveBeenCalled();
  });

  it("validates all configuration before creating exactly one pool-backed runtime", async () => {
    const order: string[] = [];
    const end = vi.fn().mockResolvedValue(undefined);
    const pool = {end} as unknown as Pool;
    const createPool = vi.fn<(config: PoolConfig) => Pool>((config) => {
      order.push("pool");
      expect(config).toBe(postgresConfig);
      return pool;
    });

    const runtime = createInquiryNotificationWorker({
      readPostgresConfiguration: () => { order.push("postgres-config"); return postgresConfig; },
      readTelegramConfiguration: () => { order.push("telegram-config"); return {botToken: "123456:test_token"}; },
      createPool,
    });

    expect(order).toEqual(["postgres-config", "telegram-config", "pool"]);
    expect(createPool).toHaveBeenCalledTimes(1);
    await runtime.close();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
