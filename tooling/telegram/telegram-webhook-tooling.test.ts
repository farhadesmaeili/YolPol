import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";

import {
  runGetTelegramWebhookInfo,
  runSetTelegramWebhook,
} from "./telegram-webhook-commands";
import {TelegramWebhookClient, TelegramWebhookOperationError} from "./telegram-webhook-client";
import {
  buildTelegramWebhookUrl,
  normalizeTelegramWebhookPublicOrigin,
  readTelegramWebhookInfoToolingConfig,
  readTelegramWebhookSetToolingConfig,
} from "./telegram-webhook-config";

const botToken = `123456:${"A".repeat(26)}_abcd`;
const webhookSecret = "WEBHOOK_SECRET_SENTINEL";
const publicOrigin = "https://persistent-tunnel.example.test";
const webhookUrl = `${publicOrigin}/api/webhooks/telegram`;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});
}

function outputLogger() {
  const lines: string[] = [];
  return {logger: {info: (message: string) => { lines.push(message); }}, lines};
}

function requestUrl(input: string | URL | Request): URL {
  if (input instanceof URL) return input;
  return new URL(typeof input === "string" ? input : input.url);
}

describe("Telegram webhook tooling configuration", () => {
  it("accepts and normalizes an absolute HTTPS origin", () => {
    expect(normalizeTelegramWebhookPublicOrigin(`${publicOrigin}/`)).toBe(publicOrigin);
    expect(buildTelegramWebhookUrl(`${publicOrigin}/`)).toBe(webhookUrl);
  });

  it.each([
    "http://persistent-tunnel.example.test",
    "https://user:password@persistent-tunnel.example.test",
    "https://persistent-tunnel.example.test/api/webhooks/telegram",
    "https://persistent-tunnel.example.test?secret=value",
    "https://persistent-tunnel.example.test#fragment",
    "not-a-url",
  ])("rejects a non-origin or unsafe public URL: %s", (value) => {
    expect(() => normalizeTelegramWebhookPublicOrigin(value)).toThrow();
  });

  it("fails safely when public origin or Bot token is missing", () => {
    expect(() => readTelegramWebhookInfoToolingConfig({TELEGRAM_BOT_TOKEN: botToken})).toThrow(/TELEGRAM_WEBHOOK_PUBLIC_ORIGIN/u);
    expect(() => readTelegramWebhookInfoToolingConfig({TELEGRAM_WEBHOOK_PUBLIC_ORIGIN: publicOrigin})).toThrow(/TELEGRAM_BOT_TOKEN/u);
  });

  it("requires the webhook secret only for the set command", () => {
    const environment = {TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_WEBHOOK_PUBLIC_ORIGIN: publicOrigin};
    expect(readTelegramWebhookInfoToolingConfig(environment)).toMatchObject({webhookUrl});
    expect(() => readTelegramWebhookSetToolingConfig(environment)).toThrow(/TELEGRAM_WEBHOOK_SECRET/u);
  });
});

describe("Telegram webhook management client", () => {
  it("posts the exact safe setWebhook policy without dropping pending updates", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ok: true, result: true}));
    const client = new TelegramWebhookClient(botToken, fetcher);

    await client.setWebhook({
      url: webhookUrl,
      secretToken: webhookSecret,
      allowedUpdates: ["message"],
      dropPendingUpdates: false,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetcher.mock.calls[0]!;
    expect(requestUrl(endpoint).pathname).toMatch(/\/setWebhook$/u);
    expect(init).toMatchObject({method: "POST", headers: {"Content-Type": "application/json"}});
    expect(JSON.parse(String(init?.body))).toEqual({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });
  });

  it("reads getWebhookInfo without invoking a mutating Telegram method", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
      ok: true,
      result: {
        url: webhookUrl,
        pending_update_count: 3,
        last_error_date: 1_787_765_000,
        last_error_message: "Wrong response from webhook: 503 Service Unavailable",
      },
    }));
    const client = new TelegramWebhookClient(botToken, fetcher);

    await expect(client.getWebhookInfo()).resolves.toEqual({
      url: webhookUrl,
      pendingUpdateCount: 3,
      lastErrorDate: 1_787_765_000,
      lastErrorMessage: "Wrong response from webhook: 503 Service Unavailable",
    });
    const [endpoint, init] = fetcher.mock.calls[0]!;
    expect(requestUrl(endpoint).pathname).toMatch(/\/getWebhookInfo$/u);
    expect(requestUrl(endpoint).pathname).not.toMatch(/setWebhook/u);
    expect(init).toMatchObject({method: "POST", body: "{}"});
  });

  it("maps provider failures to a secret-safe operational error", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ok: false, description: `${botToken} ${webhookSecret}`}, 401));
    const client = new TelegramWebhookClient(botToken, fetcher);

    const error = await client.getWebhookInfo().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TelegramWebhookOperationError);
    expect(String(error)).not.toContain(botToken);
    expect(String(error)).not.toContain(webhookSecret);
  });
});

describe("Telegram webhook management commands", () => {
  it("prints only safe setWebhook confirmation", async () => {
    const setWebhook = vi.fn().mockResolvedValue(undefined);
    const {logger, lines} = outputLogger();
    const config = readTelegramWebhookSetToolingConfig({
      TELEGRAM_BOT_TOKEN: botToken,
      TELEGRAM_WEBHOOK_SECRET: webhookSecret,
      TELEGRAM_WEBHOOK_PUBLIC_ORIGIN: publicOrigin,
    });

    await runSetTelegramWebhook({config, client: {setWebhook}, logger});

    expect(setWebhook).toHaveBeenCalledWith({
      url: webhookUrl,
      secretToken: webhookSecret,
      allowedUpdates: ["message"],
      dropPendingUpdates: false,
    });
    expect(lines).toEqual([
      "Telegram webhook configured successfully.",
      `Webhook URL: ${webhookUrl}`,
      "Pending updates were preserved.",
    ]);
    expect(JSON.stringify(lines)).not.toContain(botToken);
    expect(JSON.stringify(lines)).not.toContain(webhookSecret);
  });

  it.each([
    [webhookUrl, "MATCH"],
    ["https://different-tunnel.example.test/api/webhooks/telegram", "MISMATCH"],
  ] as const)("reports registered URL status %s as %s without mutation", async (registeredUrl, status) => {
    const getWebhookInfo = vi.fn().mockResolvedValue({
      url: registeredUrl,
      pendingUpdateCount: 2,
      lastErrorDate: null,
      lastErrorMessage: null,
    });
    const {logger, lines} = outputLogger();
    const config = readTelegramWebhookInfoToolingConfig({
      TELEGRAM_BOT_TOKEN: botToken,
      TELEGRAM_WEBHOOK_PUBLIC_ORIGIN: publicOrigin,
    });

    await runGetTelegramWebhookInfo({config, client: {getWebhookInfo}, logger});

    expect(getWebhookInfo).toHaveBeenCalledTimes(1);
    expect(lines).toContain(`Webhook status: ${status}`);
    expect(lines).toContain("Pending update count: 2");
  });

  it("redacts sensitive values and provider URLs from the optional last error", async () => {
    const getWebhookInfo = vi.fn().mockResolvedValue({
      url: webhookUrl,
      pendingUpdateCount: 0,
      lastErrorDate: 1_787_765_000,
      lastErrorMessage: `Failure at https://api.telegram.org/bot${botToken}/setWebhook for staff@example.test using ${webhookSecret}`,
    });
    const {logger, lines} = outputLogger();
    const config = readTelegramWebhookInfoToolingConfig({
      TELEGRAM_BOT_TOKEN: botToken,
      TELEGRAM_WEBHOOK_PUBLIC_ORIGIN: publicOrigin,
    });

    await runGetTelegramWebhookInfo({
      config,
      client: {getWebhookInfo},
      logger,
      additionalSensitiveValues: [webhookSecret],
    });

    const output = lines.join("\n");
    expect(output).not.toContain(botToken);
    expect(output).not.toContain(webhookSecret);
    expect(output).not.toContain("staff@example.test");
    expect(output).not.toContain("api.telegram.org");
    expect(output).toContain("[redacted-url]");
    expect(output).toContain("[redacted-email]");
    expect(output).toContain("Last recorded delivery error:");
    expect(output).toContain("Date: 2026-08-26T17:23:20.000Z");
    expect(output).toContain("Message: Failure at [redacted-url] for [redacted-email] using [redacted]");
    expect(output).toContain("does not by itself indicate a current failure");
    expect(output).not.toContain("Last error date:");
    expect(output).not.toContain("Last error message:");
  });

  it("omits the historical delivery-error section when Telegram returns no last error fields", async () => {
    const getWebhookInfo = vi.fn().mockResolvedValue({
      url: webhookUrl,
      pendingUpdateCount: 0,
      lastErrorDate: null,
      lastErrorMessage: null,
    });
    const {logger, lines} = outputLogger();
    const config = readTelegramWebhookInfoToolingConfig({
      TELEGRAM_BOT_TOKEN: botToken,
      TELEGRAM_WEBHOOK_PUBLIC_ORIGIN: publicOrigin,
    });

    await runGetTelegramWebhookInfo({config, client: {getWebhookInfo}, logger});

    expect(lines).toEqual([
      `Expected webhook URL: ${webhookUrl}`,
      `Registered webhook URL: ${webhookUrl}`,
      "Webhook status: MATCH",
      "Pending update count: 0",
    ]);
    expect(getWebhookInfo).toHaveBeenCalledTimes(1);
  });

  it("omits an unsafe registered webhook URL without leaking credentials or tokens", async () => {
    const unsafeCredential = "unsafe-user";
    const unsafePassword = "unsafe-password";
    const unsafeQueryToken = "UNSAFE_QUERY_TOKEN_SENTINEL";
    const getWebhookInfo = vi.fn().mockResolvedValue({
      url: `https://${unsafeCredential}:${unsafePassword}@persistent-tunnel.example.test/api/webhooks/telegram?token=${unsafeQueryToken}`,
      pendingUpdateCount: 0,
      lastErrorDate: null,
      lastErrorMessage: null,
    });
    const setWebhook = vi.fn();
    const client = {getWebhookInfo, setWebhook};
    const {logger, lines} = outputLogger();
    const config = readTelegramWebhookInfoToolingConfig({
      TELEGRAM_BOT_TOKEN: botToken,
      TELEGRAM_WEBHOOK_PUBLIC_ORIGIN: publicOrigin,
    });

    await runGetTelegramWebhookInfo({
      config,
      client,
      logger,
      additionalSensitiveValues: [webhookSecret],
    });

    const output = lines.join("\n");
    expect(getWebhookInfo).toHaveBeenCalledTimes(1);
    expect(setWebhook).not.toHaveBeenCalled();
    expect(output).toContain("Registered webhook URL: (unsafe URL omitted)");
    expect(output).toContain("Webhook status: MISMATCH");
    for (const forbidden of [unsafeCredential, unsafePassword, unsafeQueryToken, botToken, webhookSecret]) {
      expect(output).not.toContain(forbidden);
    }
  });

  it("keeps both tooling entrypoints repository-native and separate", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {scripts?: Record<string, string>};
    expect(packageJson.scripts?.["telegram:webhook:set"]).toBe("pnpm exec tsx tooling/telegram/set-telegram-webhook.ts");
    expect(packageJson.scripts?.["telegram:webhook:info"]).toBe("pnpm exec tsx tooling/telegram/get-telegram-webhook-info.ts");
  });
});
