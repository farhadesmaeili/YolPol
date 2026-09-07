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
  it("replays repaired rows before advancing a cursor from a later full page", async () => {
    const controller = new AbortController();
    let polls = 0;
    const received: number[] = [];
    const execute = vi.fn(async ({afterCursor, limit = 100}: Readonly<{afterCursor: number; limit?: number}>) => {
      const positions = Array.from({length: 205}, (_, index) => index + 20).filter((position) => polls > 0 || position !== 20);
      return {status: "found" as const, updates: positions.filter((position) => position > afterCursor).slice(0, limit)
        .map((cursor) => ({...update, cursor, ...(polls === 0 ? {resumeCursor: 19} : {}), message: {...update.message, id: `message-${cursor}`}}))};
    });
    const unavailable = vi.fn();
    const opened = new StreamConversationUpdates({execute}, new InMemoryConversationUpdateStreamRegistry(), {
      wait: async () => { if (++polls === 7) controller.abort(); },
    }).open({conversationId: "conversation-1", inquiryId: "inquiry-1", afterCursor: 19, signal: controller.signal,
      onUpdate: ({cursor}) => received.push(cursor), onUnavailable: unavailable});
    if (opened.status !== "opened") throw new Error("Expected open stream");
    await opened.session.completed;
    expect(unavailable).not.toHaveBeenCalled();
    expect(new Set(received).size).toBe(205);
    expect(received.indexOf(20)).toBeLessThan(received.indexOf(121));
    expect(execute).toHaveBeenCalledTimes(7);
  });

  it.each(["repair-and-append", "second-held-first"] as const)("does not lose repaired messages during %s", async (scenario) => {
    const controller = new AbortController();
    let polls = 0;
    const received: number[] = [];
    const execute = vi.fn(async ({afterCursor, limit = 100}: Readonly<{afterCursor: number; limit?: number}>) => {
      const positions = polls === 0 ? [21, 23] : scenario === "repair-and-append" ? [20, 21, 22, 23, 24] : [21, 22, 23];
      return {status: "found" as const, updates: positions.filter((position) => position > afterCursor).slice(0, limit)
        .map((cursor) => ({...update, cursor, ...(scenario === "second-held-first" || polls === 0 ? {resumeCursor: 19} : {}),
          message: {...update.message, id: `message-${cursor}`}}))};
    });
    const unavailable = vi.fn();
    const opened = new StreamConversationUpdates({execute}, new InMemoryConversationUpdateStreamRegistry(), {
      wait: async () => { if (++polls === 6) controller.abort(); },
    }).open({conversationId: "conversation-1", inquiryId: "inquiry-1", afterCursor: 19, signal: controller.signal,
      onUpdate: ({cursor}) => received.push(cursor), onUnavailable: unavailable});
    if (opened.status !== "opened") throw new Error("Expected open stream");
    await opened.session.completed;
    expect(unavailable).not.toHaveBeenCalled();
    expect(new Set(received)).toEqual(new Set(scenario === "repair-and-append" ? [20, 21, 22, 23, 24] : [21, 22, 23]));
  });

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

  it("scans past a held translation and replays from its safe cursor after repair", async () => {
    const held = {...update, cursor: 25, resumeCursor: 19, message: {...update.message, id: "message-25"}};
    const repaired = {...update, cursor: 20, message: {...update.message, id: "message-20"}};
    const advanced = {...held, resumeCursor: undefined};
    let resolved = false;
    const execute = vi.fn(async ({afterCursor, limit}: Readonly<{inquiryId: string; afterCursor: number; limit?: number}>) => ({
      status: "found" as const,
      updates: afterCursor === 19
        ? (resolved ? (limit === 1 ? [repaired] : [repaired, advanced]) : [held])
        : [],
    }));
    const controller = new AbortController();
    const received = vi.fn();
    let waits = 0;
    const stream = new StreamConversationUpdates({execute}, new InMemoryConversationUpdateStreamRegistry(), {
      wait: async () => {
        waits += 1;
        if (waits === 2) resolved = true;
        if (waits === 4) controller.abort();
      },
    }).open({conversationId: "conversation-1", inquiryId: "inquiry-1", afterCursor: 19,
      signal: controller.signal, onUpdate: received, onUnavailable: vi.fn()});
    expect(stream.status).toBe("opened");
    if (stream.status !== "opened") return;
    await stream.session.completed;

    expect(received.mock.calls.map(([value]) => ({cursor: value.cursor, resumeCursor: value.resumeCursor}))).toEqual([
      {cursor: 25, resumeCursor: 19},
      {cursor: 20, resumeCursor: undefined},
      {cursor: 25, resumeCursor: undefined},
    ]);
    expect(execute.mock.calls.every(([request]) => request.limit === 100)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
