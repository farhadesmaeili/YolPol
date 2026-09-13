import {describe, expect, it, vi} from "vitest";

import {TelegramCommunicationAdapter} from "@/features/inquiries/infrastructure/communication/telegram/telegram-communication-adapter";

const response = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), {status});

describe("TelegramCommunicationAdapter", () => {
  it("sends plain text through sendMessage and returns provider correlation", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, {ok: true, result: {message_id: 44, chat: {id: -100123}}}));
    const result = await new TelegramCommunicationAdapter("123456:test_token", fetcher).sendMessage({recipientExternalId: "-100123", message: {text: "Inquiry"}});
    expect(result).toEqual({status: "delivered", telegramChatId: -100123, telegramMessageId: 44});
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123456:test_token/sendMessage");
    expect(JSON.parse(String(init.body))).toEqual({chat_id: "-100123", text: "Inquiry"});
    expect(JSON.stringify(result)).not.toContain("test_token");
  });

  it.each([
    [429, {ok: false, error_code: 429, parameters: {retry_after: 17}}, {status: "retryable_failure", errorCode: "RATE_LIMITED", retryAfterSeconds: 17}],
    [500, {ok: false, error_code: 500}, {status: "retryable_failure", errorCode: "TELEGRAM_SERVER_ERROR"}],
    [400, {ok: false, error_code: 400}, {status: "retryable_failure", errorCode: "INVALID_REQUEST"}],
    [401, {ok: false, error_code: 401}, {status: "retryable_failure", errorCode: "INVALID_BOT_TOKEN"}],
    [403, {ok: false, error_code: 403}, {status: "permanent_failure", errorCode: "RECIPIENT_FORBIDDEN"}],
    [200, {ok: false, error_code: 500}, {status: "retryable_failure", errorCode: "TELEGRAM_SERVER_ERROR"}],
  ] as const)("classifies Telegram response %# safely", async (status, body, expected) => {
    const fetcher = vi.fn().mockResolvedValue(response(status, body));
    await expect(new TelegramCommunicationAdapter("123456:test_token", fetcher).sendMessage({recipientExternalId: "1", message: {text: "Inquiry"}})).resolves.toEqual(expected);
  });

  it("treats malformed success and network failures as ambiguous", async () => {
    const malformed = vi.fn().mockResolvedValue(response(200, "not-json"));
    await expect(new TelegramCommunicationAdapter("123456:test_token", malformed).sendMessage({recipientExternalId: "1", message: {text: "Inquiry"}})).resolves.toEqual({status: "unknown", errorCode: "MALFORMED_RESPONSE"});
    const malformedObject = vi.fn().mockResolvedValue(response(200, {result: {message_id: 44, chat: {id: 1}}}));
    await expect(new TelegramCommunicationAdapter("123456:test_token", malformedObject).sendMessage({recipientExternalId: "1", message: {text: "Inquiry"}})).resolves.toEqual({status: "unknown", errorCode: "MALFORMED_RESPONSE"});
    const failed = vi.fn().mockRejectedValue(new Error("https://api.telegram.org/bot123456:test_token/sendMessage failed"));
    const result = await new TelegramCommunicationAdapter("123456:test_token", failed).sendMessage({recipientExternalId: "1", message: {text: "Inquiry"}});
    expect(result).toEqual({status: "unknown", errorCode: "NETWORK_OUTCOME_UNKNOWN"});
    expect(JSON.stringify(result)).not.toContain("123456:test_token");
  });

  it("preserves the largest documented 52-bit chat identifier exactly", async () => {
    const chatId = -(2 ** 52 - 1);
    const fetcher = vi.fn().mockResolvedValue(response(200, {ok: true, result: {message_id: 2_147_483_647, chat: {id: chatId}}}));
    await expect(new TelegramCommunicationAdapter("123456:test_token", fetcher).sendMessage({recipientExternalId: String(chatId), message: {text: "Inquiry"}})).resolves.toEqual({status: "delivered", telegramChatId: chatId, telegramMessageId: 2_147_483_647});
  });

  it("treats timeout as an ambiguous remote outcome", async () => {
    const pending = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    await expect(new TelegramCommunicationAdapter("123456:test_token", pending, 1).sendMessage({recipientExternalId: "1", message: {text: "Inquiry"}})).resolves.toEqual({status: "unknown", errorCode: "TIMEOUT_OUTCOME_UNKNOWN"});
  });
});
