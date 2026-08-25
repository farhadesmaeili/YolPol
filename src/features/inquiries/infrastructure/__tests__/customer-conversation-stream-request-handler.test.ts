import {describe, expect, it, vi} from "vitest";

import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";
import {createCustomerConversationStreamRequestHandler} from "@/features/inquiries/infrastructure/http/customer-conversation-stream-request-handler";

const token = `ypc_${"A".repeat(43)}`;
const request = (signal?: AbortSignal) => new Request(`https://yolpol.com/api/conversations/${token}/stream`, {headers: {Origin: "https://yolpol.com"}, signal});
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
    await reader.cancel();
    expect(close).toHaveBeenCalledOnce();
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
});
