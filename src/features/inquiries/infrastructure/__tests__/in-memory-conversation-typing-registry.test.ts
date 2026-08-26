import {afterEach, describe, expect, it, vi} from "vitest";

import {InMemoryConversationTypingRegistry, conversationTypingTtlMs} from "@/features/inquiries/infrastructure/streaming/in-memory-conversation-typing-registry";

afterEach(() => {
  vi.useRealTimers();
});

describe("InMemoryConversationTypingRegistry", () => {
  it("publishes customer transitions, refreshes heartbeats, expires by TTL, and stores no draft data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const registry = new InMemoryConversationTypingRegistry();
    const listener = vi.fn();
    registry.subscribe({conversationId: "conversation-1", participant: "CUSTOMER", listener});
    expect(listener).toHaveBeenCalledWith({participant: "CUSTOMER", isTyping: false});
    listener.mockClear();

    registry.update({conversationId: "conversation-1", participant: "CUSTOMER", actorKey: "customer", isTyping: true});
    expect(listener).toHaveBeenCalledWith({participant: "CUSTOMER", isTyping: true});
    vi.advanceTimersByTime(2_000);
    registry.update({conversationId: "conversation-1", participant: "CUSTOMER", actorKey: "customer", isTyping: true});
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(conversationTypingTtlMs - 1);
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenLastCalledWith({participant: "CUSTOMER", isTyping: false});
    expect(registry.activeStateCount()).toBe(0);
    expect(JSON.stringify(listener.mock.calls)).not.toMatch(/draft|body|message|email|token/u);
  });

  it("clears explicitly and isolates conversations and participants", () => {
    const registry = new InMemoryConversationTypingRegistry();
    const customerOne = vi.fn();
    const customerTwo = vi.fn();
    const staffOne = vi.fn();
    registry.subscribe({conversationId: "conversation-1", participant: "CUSTOMER", listener: customerOne});
    registry.subscribe({conversationId: "conversation-2", participant: "CUSTOMER", listener: customerTwo});
    registry.subscribe({conversationId: "conversation-1", participant: "STAFF", listener: staffOne});
    customerOne.mockClear();
    customerTwo.mockClear();
    staffOne.mockClear();

    registry.update({conversationId: "conversation-1", participant: "CUSTOMER", actorKey: "customer", isTyping: true});
    registry.update({conversationId: "conversation-1", participant: "CUSTOMER", actorKey: "customer", isTyping: false});
    expect(customerOne.mock.calls.map(([event]) => event.isTyping)).toEqual([true, false]);
    expect(customerTwo).not.toHaveBeenCalled();
    expect(staffOne).not.toHaveBeenCalled();
  });

  it("keeps aggregate Staff presence active until every Staff actor stops", () => {
    const registry = new InMemoryConversationTypingRegistry();
    const listener = vi.fn();
    registry.subscribe({conversationId: "conversation-1", participant: "STAFF", listener});
    listener.mockClear();
    registry.update({conversationId: "conversation-1", participant: "STAFF", actorKey: "member-a", isTyping: true});
    registry.update({conversationId: "conversation-1", participant: "STAFF", actorKey: "member-b", isTyping: true});
    registry.update({conversationId: "conversation-1", participant: "STAFF", actorKey: "member-a", isTyping: false});
    expect(listener.mock.calls.map(([event]) => event.isTyping)).toEqual([true]);
    registry.update({conversationId: "conversation-1", participant: "STAFF", actorKey: "member-b", isTyping: false});
    expect(listener.mock.calls.map(([event]) => event.isTyping)).toEqual([true, false]);
  });

  it("delivers the current active snapshot to a new subscriber and cleans subscriptions idempotently", () => {
    const registry = new InMemoryConversationTypingRegistry(5_000, 1);
    registry.update({conversationId: "conversation-1", participant: "STAFF", actorKey: "member-a", isTyping: true});
    const listener = vi.fn();
    const subscription = registry.subscribe({conversationId: "conversation-1", participant: "STAFF", listener});
    expect(listener).toHaveBeenCalledWith({participant: "STAFF", isTyping: true});
    expect(registry.subscribe({conversationId: "conversation-2", participant: "STAFF", listener: vi.fn()})).toBeNull();
    subscription!.close();
    subscription!.close();
    expect(registry.activeSubscriptionCount()).toBe(0);
  });
});
