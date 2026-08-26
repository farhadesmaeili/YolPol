import {afterEach, describe, expect, it, vi} from "vitest";

import {
  ConversationTypingHeartbeat,
  conversationTypingHeartbeatIntervalMs,
  conversationTypingInactivityThresholdMs,
  parseConversationTypingEvent,
  sendCustomerConversationTyping,
  sendStaffConversationTyping,
} from "@/features/inquiries/presentation/clients/conversation-typing-client";

afterEach(() => vi.useRealTimers());

describe("Conversation typing client", () => {
  it("sends one start, controlled heartbeats, inactivity stop, and explicit send stop", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue(undefined);
    const heartbeat = new ConversationTypingHeartbeat(send);
    heartbeat.draftChanged("H");
    heartbeat.draftChanged("He");
    heartbeat.draftChanged("Hel");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(conversationTypingHeartbeatIntervalMs);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(conversationTypingInactivityThresholdMs - conversationTypingHeartbeatIntervalMs);
    expect(send).toHaveBeenLastCalledWith(false);
    heartbeat.draftChanged("Again");
    heartbeat.stop();
    expect(send.mock.calls.slice(-2).map(([value]) => value)).toEqual([true, false]);
  });

  it("stops for an empty draft or disposal and swallows heartbeat failures", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValue(new Error("network"));
    const heartbeat = new ConversationTypingHeartbeat(send);
    expect(() => heartbeat.draftChanged("Text")).not.toThrow();
    heartbeat.draftChanged("   ");
    heartbeat.draftChanged("More");
    expect(() => heartbeat.dispose()).not.toThrow();
    await Promise.resolve();
    expect(send.mock.calls.map(([value]) => value)).toEqual([true, false, true, false]);
  });

  it("posts exact minimal customer and Staff payloads with keepalive", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 204}));
    const token = `ypc_${"A".repeat(43)}`;
    await sendCustomerConversationTyping(token, true, fetcher);
    await sendStaffConversationTyping("inquiry-1", false, fetcher);
    expect(fetcher).toHaveBeenNthCalledWith(1, `/api/conversations/${token}/typing`, expect.objectContaining({body: '{"isTyping":true}', keepalive: true}));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/staff/inquiries/inquiry-1/typing", expect.objectContaining({body: '{"isTyping":false}', keepalive: true}));
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/draft|actorReference|teamMemberId|staffAccountId|role/u);
  });

  it("strictly parses safe aggregate events and rejects identity-bearing data", () => {
    expect(parseConversationTypingEvent({participant: "STAFF", isTyping: true}, "STAFF")).toBe(true);
    expect(parseConversationTypingEvent({participant: "CUSTOMER", isTyping: false}, "CUSTOMER")).toBe(false);
    expect(parseConversationTypingEvent({participant: "STAFF", isTyping: true, actorReference: "staff:member-1"}, "STAFF")).toBeNull();
    expect(parseConversationTypingEvent({participant: "STAFF", isTyping: "true"}, "STAFF")).toBeNull();
  });
});
