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

  it("resumes after the last delivered position without duplicates or missed persisted messages", async () => {
    const updates = [
      update,
      {...update, cursor: 1, message: {...update.message, id: "message-2"}},
      {...update, cursor: 2, message: {...update.message, id: "message-3"}},
    ] as const;
    let available: readonly typeof updates[number][] = updates.slice(0, 2);
    const execute = vi.fn(async ({afterCursor}: Readonly<{afterCursor: number}>) => ({
      status: "found" as const,
      updates: available.filter(({cursor}) => cursor > afterCursor),
    }));
    const firstController = new AbortController();
    const firstUpdates = vi.fn();
    const first = new StreamConversationUpdates({execute}, new InMemoryConversationUpdateStreamRegistry(), new AbortOnlyDelay()).open({
      conversationId: "conversation-1",
      inquiryId: "inquiry-1",
      afterCursor: -1,
      signal: firstController.signal,
      onUpdate: firstUpdates,
      onUnavailable: vi.fn(),
    });
    expect(first.status).toBe("opened");
    if (first.status !== "opened") return;
    await vi.waitFor(() => expect(firstUpdates).toHaveBeenCalledTimes(2));
    firstController.abort();
    await first.session.completed;

    available = updates;
    const reconnectController = new AbortController();
    const recovered = vi.fn();
    const reconnect = new StreamConversationUpdates({execute}, new InMemoryConversationUpdateStreamRegistry(), new AbortOnlyDelay()).open({
      conversationId: "conversation-1",
      inquiryId: "inquiry-1",
      afterCursor: 1,
      signal: reconnectController.signal,
      onUpdate: recovered,
      onUnavailable: vi.fn(),
    });
    expect(reconnect.status).toBe("opened");
    if (reconnect.status !== "opened") return;
    await vi.waitFor(() => expect(recovered).toHaveBeenCalledOnce());
    expect(recovered).toHaveBeenCalledWith(updates[2]);
    reconnectController.abort();
    await reconnect.session.completed;
  });
});
