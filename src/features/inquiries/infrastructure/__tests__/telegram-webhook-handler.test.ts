import {describe, expect, it, vi} from "vitest";

import type {ReceiveTelegramReplyResult} from "@/features/inquiries/application/results/receive-telegram-reply-result";
import {createTelegramWebhookHandler, telegramWebhookRequestSizeLimit} from "@/features/inquiries/infrastructure/http/telegram-webhook-handler";

const secret = "test-webhook-secret";
const validUpdate = {
  update_id: 987654,
  message: {
    message_id: 45,
    from: {id: 456},
    chat: {id: -100123},
    text: "We can ship next week.",
    reply_to_message: {message_id: 44, text: "Inquiry #1234"},
  },
};

function request(body: string, headers: HeadersInit = {}): Request {
  return new Request("https://yolpol.com/api/webhooks/telegram", {
    method: "POST",
    body,
    headers: {"Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret, ...headers},
  });
}

function handler(result: ReceiveTelegramReplyResult = {status: "created"}) {
  const execute = vi.fn().mockResolvedValue(result);
  return {execute, handle: createTelegramWebhookHandler(() => ({execute}), () => secret)};
}

describe("Telegram webhook handler", () => {
  it("authenticates, parses, and accepts a valid update", async () => {
    const {execute, handle} = handler();
    const response = await handle(request(JSON.stringify(validUpdate)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({status: "accepted"});
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({senderExternalId: "456", inquiryId: "1234", body: "We can ship next week."}));
  });

  it("returns the same success contract for a duplicate update", async () => {
    const response = await handler({status: "duplicate"}).handle(request(JSON.stringify(validUpdate)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({status: "accepted"});
  });

  it.each([
    [{status: "unauthorized"}, 403, "unauthorized_sender"],
    [{status: "conversation_not_found"}, 422, "conversation_not_found"],
    [{status: "invalid_reply"}, 400, "invalid_update"],
    [{status: "persistence_failed"}, 503, "service_unavailable"],
  ] as const)("maps %s safely", async (result, status, code) => {
    const response = await handler(result).handle(request(JSON.stringify(validUpdate)));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({status: "error", code});
  });

  it("rejects a missing or invalid secret before parsing or execution", async () => {
    const {execute, handle} = handler();
    for (const supplied of [undefined, "wrong-secret"]) {
      const headers = new Headers({"Content-Type": "application/json"});
      if (supplied) headers.set("X-Telegram-Bot-Api-Secret-Token", supplied);
      const response = await handle(new Request("https://yolpol.com/api/webhooks/telegram", {method: "POST", body: JSON.stringify(validUpdate), headers}));
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain(secret);
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [request("{"), 400, "invalid_request"],
    [request(JSON.stringify({update_id: 1})), 400, "invalid_update"],
    [request("{}", {"Content-Type": "text/plain"}), 415, "unsupported_media_type"],
    [request("x".repeat(telegramWebhookRequestSizeLimit + 1)), 413, "payload_too_large"],
  ])("rejects unsafe request bodies", async (input, status, code) => {
    const response = await handler().handle(input);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({code});
  });

  it("fails closed when webhook configuration is unavailable without exposing details", async () => {
    const configuredSecret = "never-expose-this-value";
    const handle = createTelegramWebhookHandler(() => ({async execute() { return {status: "created"}; }}), () => { throw new Error(configuredSecret); });
    const response = await handle(request(JSON.stringify(validUpdate)));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(configuredSecret);
  });
});
