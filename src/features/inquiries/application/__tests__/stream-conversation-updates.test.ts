import {describe, expect, it, vi} from "vitest";

import type {ConversationPollingDelay} from "@/features/inquiries/application/ports/conversation-stream-ports";
import {StreamConversationUpdates} from "@/features/inquiries/application/use-cases/stream-conversation-updates";
import {InMemoryConversationUpdateStreamRegistry} from "@/features/inquiries/infrastructure/streaming/in-memory-conversation-update-stream-registry";

const update = {cursor: 0, message: {id: "message-1", senderType: "INTERNAL_USER", channel: "TELEGRAM", body: "Your quote is ready.", createdAt: "2026-08-25T10:00:00.000Z"}} as const;

class AbortOnlyDelay implements ConversationPollingDelay {
  wait(_milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), {once: true}));
  }
}

describe("StreamConversationUpdates", () => {
  it("delivers new messages and removes the active stream on disconnect", async () => {
    const execute = vi.fn().mockResolvedValueOnce({status: "found", updates: [update]}).mockResolvedValue({status: "found", updates: []});
    const registry = new InMemoryConversationUpdateStreamRegistry();
    const controller = new AbortController();
    const onUpdate = vi.fn();
    const onUnavailable = vi.fn();
    const opened = new StreamConversationUpdates({execute}, registry, new AbortOnlyDelay()).open({conversationId: "conversation-1", inquiryId: "inquiry-1", afterCursor: -1, signal: controller.signal, onUpdate, onUnavailable});
    expect(opened.status).toBe("opened");
    if (opened.status !== "opened") return;

    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith(update));
    expect(registry.activeCount()).toBe(1);
    controller.abort();
    await opened.session.completed;
    expect(registry.activeCount()).toBe(0);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("rejects invalid stream identities without allocating resources", () => {
    const registry = new InMemoryConversationUpdateStreamRegistry();
    const result = new StreamConversationUpdates({execute: vi.fn()}, registry, new AbortOnlyDelay()).open({conversationId: "../private", inquiryId: "inquiry-1", afterCursor: -1, signal: new AbortController().signal, onUpdate: vi.fn(), onUnavailable: vi.fn()});
    expect(result).toEqual({status: "validation_failed"});
    expect(registry.activeCount()).toBe(0);
  });
});
