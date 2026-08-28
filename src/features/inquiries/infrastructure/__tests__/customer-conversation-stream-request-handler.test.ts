import {describe, expect, it, vi} from "vitest";

import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";
import {createCustomerConversationStreamRequestHandler, createCustomerResumeStreamRequestHandler} from "@/features/inquiries/infrastructure/http/customer-conversation-stream-request-handler";

const token = `ypc_${"A".repeat(43)}`;
const request = (signal?: AbortSignal, lastEventId?: string) => new Request(`https://yolpol.com/api/conversations/${token}/stream`, {headers: {Origin: "https://yolpol.com", ...(lastEventId ? {"Last-Event-ID": lastEventId} : {})}, signal});
const context = () => ({params: Promise.resolve({token})});
const resolved = {status: "resolved", conversationId: "conversation-1", inquiryId: "inquiry-1"} as const;
const update: ConversationMessageUpdate = {cursor: 4, message: {id: "message-4", senderType: "INTERNAL_USER", channel: "TELEGRAM", body: "Your quote is ready.", createdAt: "2026-08-25T10:00:00.000Z"}};
type StreamInput = Readonly<{
  conversationId: string;
  inquiryId: string;
  afterCursor: number;
  signal: AbortSignal;
  onUpdate(update: ConversationMessageUpdate): void;
  onUnavailable(): void;
}>;

describe("Customer conversation stream request handler", () => {
  it("opens a non-cacheable SSE connection after access resolution and streams messages", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved);
    const close = vi.fn();
    let streamInput: StreamInput | undefined;
    const open = vi.fn((input: StreamInput) => {
      streamInput = input;
      return {status: "opened", session: {close, completed: new Promise<void>(() => undefined)}} as const;
    });
    const response = await createCustomerConversationStreamRequestHandler(() => ({execute: resolve}), () => ({open}), {heartbeatIntervalMs: 60_000})(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(resolve).toHaveBeenCalledWith({token});
    expect(open).toHaveBeenCalledWith(expect.objectContaining({conversationId: "conversation-1", inquiryId: "inquiry-1", afterCursor: -1}));

    const reader = response.body!.getReader();
    const connected = new TextDecoder().decode((await reader.read()).value);
    expect(connected).toContain(": connected");
    streamInput!.onUpdate(update);
    const frame = new TextDecoder().decode((await reader.read()).value);
    expect(frame).toContain("id: 4\nevent: message\n");
    expect(frame).toContain(JSON.stringify(update.message));
    expect(frame).not.toContain(token);
    expect(frame).not.toMatch(/actorReference|staff:admin-main|admin-main/u);
    await reader.cancel();
    expect(close).toHaveBeenCalledOnce();
  });

  it("multiplexes safe ephemeral Staff typing without advancing the persisted message cursor", async () => {
    let typingListener: ((event: Readonly<{participant: "STAFF"; isTyping: boolean}>) => void) | undefined;
    const closeTyping = vi.fn();
    const registry = {
      update: vi.fn(),
      subscribe: vi.fn((input: Readonly<{listener(event: Readonly<{participant: "STAFF"; isTyping: boolean}>): void}>) => {
        typingListener = input.listener;
        return {close: closeTyping};
      }),
    };
    let streamInput: StreamInput | undefined;
    const open = vi.fn((input: StreamInput) => {
      streamInput = input;
      return {status: "opened", session: {close: vi.fn(), completed: new Promise<void>(() => undefined)}} as const;
    });
    const response = await createCustomerConversationStreamRequestHandler(
      () => ({execute: vi.fn().mockResolvedValue(resolved)}),
      () => ({open}),
      {heartbeatIntervalMs: 60_000},
      () => registry,
    )(request(undefined, "3"), context());
    expect(open).toHaveBeenCalledWith(expect.objectContaining({afterCursor: 3}));
    const reader = response.body!.getReader();
    await reader.read();

    typingListener!({participant: "STAFF", isTyping: true});
    const typing = new TextDecoder().decode((await reader.read()).value);
    expect(typing).toBe('event: typing\ndata: {"participant":"STAFF","isTyping":true}\n\n');
    expect(typing).not.toMatch(/^id:/mu);
    expect(typing).not.toMatch(/actorReference|staff:|teamMemberId|staffAccountId|email|role/u);

    streamInput!.onUpdate(update);
    const message = new TextDecoder().decode((await reader.read()).value);
    expect(message).toContain("id: 4\nevent: message");
    await reader.cancel();
    expect(closeTyping).toHaveBeenCalledOnce();
  });

  it("rejects invalid access without opening or echoing the token", async () => {
    const open = vi.fn();
    const response = await createCustomerConversationStreamRequestHandler(() => ({execute: vi.fn().mockResolvedValue({status: "unauthorized"})}), () => ({open}))(request(), context());
    const body = await response.text();
    expect(response.status).toBe(401);
    expect(body).toBe('{"status":"error","code":"unauthorized"}');
    expect(body).not.toContain(token);
    expect(open).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin connection before token resolution", async () => {
    const resolve = vi.fn();
    const response = await createCustomerConversationStreamRequestHandler(() => ({execute: resolve}), () => ({open: vi.fn()}))(new Request(`https://yolpol.com/api/conversations/${token}/stream`, {headers: {Origin: "https://attacker.example"}}), context());
    expect(response.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("opens the same SSE flow from a tokenless cookie-authenticated URL", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved);
    const close = vi.fn();
    const open = vi.fn(() => ({status: "opened", session: {close, completed: new Promise<void>(() => undefined)}} as const));
    const response = await createCustomerResumeStreamRequestHandler(
      () => ({execute: resolve}),
      () => ({open}),
      {heartbeatIntervalMs: 60_000},
      undefined,
      {NODE_ENV: "production"},
    )(new Request("https://yolpol.com/api/customer/conversation/stream", {headers: {Origin: "https://yolpol.com", Cookie: `__Host-yolpol_customer_conversation=${token}`}}));
    expect(response.status).toBe(200);
    expect(resolve).toHaveBeenCalledWith({token});
    expect(response.url).not.toContain(token);
    await response.body!.cancel();
  });
});
