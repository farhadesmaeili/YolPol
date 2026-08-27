import {describe, expect, it, vi} from "vitest";

import {ConversationTypingRateLimiter} from "@/features/inquiries/infrastructure/http/conversation-typing-rate-limiter";
import {
  conversationTypingRequestSizeLimit,
  createCustomerConversationTypingRequestHandler,
  createCustomerResumeTypingRequestHandler,
} from "@/features/inquiries/infrastructure/http/customer-conversation-typing-request-handler";

const token = `ypc_${"A".repeat(43)}`;
const context = () => ({params: Promise.resolve({token})});
const resolved = {status: "resolved", conversationId: "conversation-1", inquiryId: "inquiry-1"} as const;

function request(body: BodyInit = '{"isTyping":true}', options: Readonly<{origin?: string | null; contentType?: string; query?: string}> = {}) {
  const headers = new Headers({"Content-Type": options.contentType ?? "application/json"});
  if (options.origin !== null) headers.set("Origin", options.origin ?? "https://yolpol.com");
  return new Request(`https://yolpol.com/api/conversations/${token}/typing${options.query ?? ""}`, {method: "POST", headers, body});
}

describe("POST /api/conversations/[token]/typing", () => {
  it("resolves the token and updates only minimal customer presence", async () => {
    const execute = vi.fn().mockReturnValue({status: "updated"});
    const resolver = {execute: vi.fn().mockResolvedValue(resolved)};
    const response = await createCustomerConversationTypingRequestHandler(() => resolver, () => ({execute}))(request(), context());
    expect(response.status).toBe(204);
    expect(resolver.execute).toHaveBeenCalledWith({token});
    expect(execute).toHaveBeenCalledWith({conversationId: "conversation-1", participant: "CUSTOMER", actorKey: "customer", isTyping: true});
    expect(JSON.stringify(execute.mock.calls)).not.toMatch(/draft|body|email|phone|accessToken/u);
  });

  it.each([{status: "unauthorized"}, {status: "unauthorized", expired: true}])("maps invalid and expired access to the same safe 401", async (result) => {
    const response = await createCustomerConversationTypingRequestHandler(
      () => ({execute: vi.fn().mockResolvedValue(result)}),
      () => ({execute: vi.fn()}),
    )(request(), context());
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({status: "error", code: "unauthorized"});
    expect(body).not.toContain(token);
  });

  it.each([null, "https://attacker.example", "https://yolpol.com/path"])("strictly rejects Origin %s", async (origin) => {
    const resolver = {execute: vi.fn()};
    const response = await createCustomerConversationTypingRequestHandler(() => resolver, () => ({execute: vi.fn()}))(request(undefined, {origin}), context());
    expect(response.status).toBe(403);
    expect(resolver.execute).not.toHaveBeenCalled();
  });

  it.each([
    [{}, "isTyping"],
    [{isTyping: "true"}, "isTyping"],
    [{isTyping: true, draft: "secret"}, "request"],
    [{isTyping: true, conversationId: "other"}, "request"],
    [{isTyping: true, actorReference: "staff:other"}, "request"],
    [{isTyping: true, senderType: "STAFF"}, "request"],
  ])("rejects non-exact payload %#", async (value, field) => {
    const updater = {execute: vi.fn()};
    const response = await createCustomerConversationTypingRequestHandler(
      () => ({execute: vi.fn().mockResolvedValue(resolved)}),
      () => updater,
    )(request(JSON.stringify(value)), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({status: "error", code: "invalid_request", field});
    expect(updater.execute).not.toHaveBeenCalled();
  });

  it("bounds JSON, rejects queries/media types, and rate limits heartbeat traffic independently", async () => {
    const updater = {execute: vi.fn().mockReturnValue({status: "updated"})};
    const limiter = new ConversationTypingRateLimiter({maxRequests: 1, windowMs: 60_000}, () => 1_000);
    const handler = createCustomerConversationTypingRequestHandler(
      () => ({execute: vi.fn().mockResolvedValue(resolved)}),
      () => updater,
      {rateLimiter: limiter},
    );
    expect((await handler(request(), context())).status).toBe(204);
    expect((await handler(request(), context())).status).toBe(429);
    expect((await createCustomerConversationTypingRequestHandler(() => ({execute: vi.fn()}), () => updater)(request("x".repeat(conversationTypingRequestSizeLimit + 1)), context())).status).toBe(413);
    expect((await createCustomerConversationTypingRequestHandler(() => ({execute: vi.fn()}), () => updater)(request("{}", {contentType: "text/plain"}), context())).status).toBe(415);
    expect((await createCustomerConversationTypingRequestHandler(() => ({execute: vi.fn()}), () => updater)(request(undefined, {query: "?conversationId=other"}), context())).status).toBe(400);
  });

  it("authenticates the tokenless Customer typing route from the cookie", async () => {
    const execute = vi.fn().mockReturnValue({status: "updated"});
    const resolver = {execute: vi.fn().mockResolvedValue(resolved)};
    const response = await createCustomerResumeTypingRequestHandler(
      () => resolver,
      () => ({execute}),
      {},
      {NODE_ENV: "production"},
    )(new Request("https://yolpol.com/api/customer/conversation/typing", {method: "POST", headers: {Origin: "https://yolpol.com", Cookie: `__Host-yolpol_customer_conversation=${token}`, "Content-Type": "application/json"}, body: '{"isTyping":true}'}));
    expect(response.status).toBe(204);
    expect(resolver.execute).toHaveBeenCalledWith({token});
    expect(execute).toHaveBeenCalledWith({conversationId: "conversation-1", participant: "CUSTOMER", actorKey: "customer", isTyping: true});
  });
});
