import {describe, expect, it, vi} from "vitest";

import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";
import {InMemoryConversationUpdateStreamRegistry} from "@/features/inquiries/infrastructure/streaming/in-memory-conversation-update-stream-registry";

const update = (cursor: number, id = `message-${cursor}`): ConversationMessageUpdate => ({cursor, message: {id, senderType: "INTERNAL_USER", channel: "TELEGRAM", body: `Message ${cursor}`, createdAt: "2026-08-25T10:00:00.000Z"}});

describe("InMemoryConversationUpdateStreamRegistry", () => {
  it("publishes in cursor order and prevents duplicate delivery", () => {
    const registry = new InMemoryConversationUpdateStreamRegistry();
    const listener = vi.fn();
    const registration = registry.register({conversationId: "conversation-1", afterCursor: 0, listener});
    expect(registration).not.toBeNull();

    registration!.publish([update(2), update(1), update(2, "duplicate-position")]);
    registration!.publish([update(1), update(2)]);
    expect(listener.mock.calls.map(([value]) => value.cursor)).toEqual([1, 2]);
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
