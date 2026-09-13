import {describe, expect, it, vi} from "vitest";

import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";
import {InMemoryConversationUpdateStreamRegistry, maximumRememberedConversationPositions} from "@/features/inquiries/infrastructure/streaming/in-memory-conversation-update-stream-registry";

const update = (cursor: number, id = `message-${cursor}`): ConversationMessageUpdate => ({cursor, message: {id, senderType: "INTERNAL_USER", channel: "TELEGRAM", body: `Message ${cursor}`, createdAt: "2026-08-25T10:00:00.000Z"}});

describe("InMemoryConversationUpdateStreamRegistry", () => {
  it("does not mistake an unseen lower repair for a duplicate after bounded cache eviction", () => {
    const listener = vi.fn();
    const registration = new InMemoryConversationUpdateStreamRegistry().register({conversationId: "conversation-1", afterCursor: -1, listener})!;
    const held = Array.from({length: maximumRememberedConversationPositions + 1}, (_, index) => ({...update(index + 2), resumeCursor: -1}));
    registration.publish(held);
    registration.publish([{...update(1), resumeCursor: -1}, held[0]!]);
    expect(listener.mock.calls.some(([entry]) => entry.cursor === 1)).toBe(true);
    // Replaying an evicted entry is safe: rendered state deduplicates its durable ID.
    expect(listener.mock.calls.filter(([entry]) => entry.cursor === 2)).toHaveLength(2);
    registration.close();
  });

  it("publishes in cursor order and prevents duplicate delivery", () => {
    const registry = new InMemoryConversationUpdateStreamRegistry();
    const listener = vi.fn();
    const registration = registry.register({conversationId: "conversation-1", afterCursor: 0, listener});
    expect(registration).not.toBeNull();

    registration!.publish([update(2), update(1), update(2, "duplicate-position")]);
    registration!.publish([update(1), update(2)]);
    expect(listener.mock.calls.map(([value]) => value.cursor)).toEqual([1, 2]);
  });

  it("delivers safe messages beyond a held cursor once and advances after the gap is repaired", () => {
    const registry = new InMemoryConversationUpdateStreamRegistry();
    const listener = vi.fn();
    const registration = registry.register({conversationId: "conversation-1", afterCursor: 19, listener})!;

    registration.publish([{...update(25), resumeCursor: 19}]);
    registration.publish([{...update(25), resumeCursor: 19}]);
    registration.publish([update(20), update(25)]);

    expect(listener.mock.calls.map(([value]) => ({cursor: value.cursor, resumeCursor: value.resumeCursor}))).toEqual([
      {cursor: 25, resumeCursor: 19},
      {cursor: 20, resumeCursor: undefined},
      {cursor: 25, resumeCursor: undefined},
    ]);
  });

  it("bounds registrations and cleans them up idempotently", () => {
    const registry = new InMemoryConversationUpdateStreamRegistry(1);
    const registration = registry.register({conversationId: "conversation-1", afterCursor: -1, listener: vi.fn()});
    expect(registry.activeCount()).toBe(1);
    expect(registry.register({conversationId: "conversation-2", afterCursor: -1, listener: vi.fn()})).toBeNull();
    registration!.close();
    registration!.close();
    expect(registry.activeCount()).toBe(0);
  });
});
