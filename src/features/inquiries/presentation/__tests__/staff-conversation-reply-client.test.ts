import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it, vi} from "vitest";

import {MessageId} from "@/features/inquiries/domain/value-objects/message-id";
import {
  createStaffClientMessageId,
  sendStaffConversationReply,
  StaffClientCryptoUnavailableError,
} from "@/features/inquiries/presentation/clients/staff-conversation-reply-client";

const message = Object.freeze({
  id: "staff_web_message-1",
  senderType: "INTERNAL_USER",
  channel: "WEBSITE",
  actorReference: "staff:member-1",
  body: "First line\nSecond line",
  createdAt: "2026-08-26T10:00:00.000Z",
});

function jsonResponse(status: number, body: unknown): Response {
  return Response.json(body, {status});
}

describe("Staff Conversation Reply client", () => {
  it("prefers crypto.randomUUID and returns a server-compatible message ID", () => {
    const expected = "123e4567-e89b-42d3-a456-426614174000";
    const randomUUID = vi.fn(() => expected);
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes);

    const result = createStaffClientMessageId({randomUUID, getRandomValues});

    expect(result).toBe(expected);
    expect(MessageId.create(result).value).toBe(expected);
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it("uses getRandomValues when randomUUID is unavailable and creates a canonical UUID v4", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.forEach((_value, index) => { bytes[index] = index; });
      return bytes;
    });

    const result = createStaffClientMessageId({randomUUID: undefined, getRandomValues});

    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(result).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(result[14]).toBe("4");
    expect(result[19]).toMatch(/[89ab]/u);
    expect(MessageId.create(result).value).toBe(result);
  });

  it("fails explicitly when Web Crypto randomness is unavailable and contains no insecure fallback", () => {
    expect(() => createStaffClientMessageId(null)).toThrow(StaffClientCryptoUnavailableError);
    const source = readFileSync(join(process.cwd(), "src", "features", "inquiries", "presentation", "clients", "staff-conversation-reply-client.ts"), "utf8");
    expect(source).not.toMatch(/Math\.random|Date\.now/u);
  });

  it.each([201, 200])("accepts a safe persisted message from %i without changing the request contract", async (status) => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(status, {status: "sent", message});
    });
    const result = await sendStaffConversationReply({
      inquiryId: "inquiry/safe value",
      body: message.body,
      clientMessageId: "client-message-1",
    }, new AbortController().signal, fetcher);

    expect(result).toEqual({status: "sent", message});
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/api/staff/inquiries/inquiry%2Fsafe%20value/messages");
    expect(init).toMatchObject({method: "POST", headers: {Accept: "application/json", "Content-Type": "application/json"}});
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(payload).toEqual({body: message.body, clientMessageId: "client-message-1"});
    expect(Object.keys(payload).sort()).toEqual(["body", "clientMessageId"]);
    expect(payload).not.toHaveProperty("actorReference");
    expect(payload).not.toHaveProperty("teamMemberId");
    expect(payload).not.toHaveProperty("staffAccountId");
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("senderType");
    expect(payload).not.toHaveProperty("channel");
  });

  it.each([
    [400, "invalid_message"],
    [401, "session_expired"],
    [403, "permission_denied"],
    [404, "conversation_unavailable"],
    [409, "retry_conflict"],
    [413, "message_too_large"],
    [415, "unsupported_request"],
    [429, "rate_limited"],
    [503, "service_unavailable"],
  ] as const)("maps HTTP %i to the safe %s failure", async (status, failure) => {
    const result = await sendStaffConversationReply({inquiryId: "inquiry-1", body: "Reply", clientMessageId: "client-1"}, new AbortController().signal, async () => jsonResponse(status, {unsafe: "ignored"}));
    expect(result).toEqual({status: "failed", failure});
  });

  it("rejects malformed success data and maps network failures safely", async () => {
    const invalid = await sendStaffConversationReply({inquiryId: "inquiry-1", body: "Reply", clientMessageId: "client-1"}, new AbortController().signal, async () => jsonResponse(201, {status: "sent", message: {...message, actorReference: "staff:member-1\nleak"}}));
    const network = await sendStaffConversationReply({inquiryId: "inquiry-1", body: "Reply", clientMessageId: "client-1"}, new AbortController().signal, async () => { throw new Error("database details"); });
    expect(invalid).toEqual({status: "failed", failure: "service_unavailable"});
    expect(network).toEqual({status: "failed", failure: "service_unavailable"});
  });
});
