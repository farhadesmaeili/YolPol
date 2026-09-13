import {describe, expect, it, vi} from "vitest";

import type {StaffConversationEventSource} from "@/features/inquiries/presentation/clients/staff-conversation-stream-client";
import {subscribeToStaffConversation} from "@/features/inquiries/presentation/clients/staff-conversation-stream-client";

describe("Staff conversation stream client", () => {
  it("opens from rendered history, parses persisted and typing events, and closes", () => {
    const listeners: Partial<Record<"message" | "typing", (event: MessageEvent<string>) => void>> = {};
    const source: StaffConversationEventSource = {
      addEventListener: (type, listener) => { listeners[type] = listener; },
      close: vi.fn(),
    };
    const create = vi.fn().mockReturnValue(source);
    const onTyping = vi.fn();
    const onMessage = vi.fn();
    const subscription = subscribeToStaffConversation({
      inquiryId: "inquiry-1",
      afterCursor: 3,
      onCustomerTyping: onTyping,
      onMessage,
    }, create);

    expect(create).toHaveBeenCalledWith("/api/staff/inquiries/inquiry-1/stream?cursor=3");
    listeners.typing!({data: '{"participant":"CUSTOMER","isTyping":true}'} as MessageEvent<string>);
    listeners.typing!({data: '{"participant":"CUSTOMER","isTyping":false}'} as MessageEvent<string>);
    listeners.message!({
      lastEventId: "4",
      data: JSON.stringify({id: "message-4", senderType: "CUSTOMER", channel: "WEBSITE", actorReference: null, body: "New message", createdAt: "2026-08-28T10:00:00.000Z"}),
    } as MessageEvent<string>);

    expect(onTyping.mock.calls.map(([value]) => value)).toEqual([true, false]);
    expect(onMessage).toHaveBeenCalledWith({cursor: 4, message: {
      id: "message-4",
      senderType: "CUSTOMER",
      channel: "WEBSITE",
      actorReference: null,
      body: "New message",
      createdAt: "2026-08-28T10:00:00.000Z",
    }});
    subscription!.close();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("ignores malformed frames and rejects unsafe identifiers or cursors before opening", () => {
    const listeners: Partial<Record<"message" | "typing", (event: MessageEvent<string>) => void>> = {};
    const source: StaffConversationEventSource = {addEventListener: (type, listener) => { listeners[type] = listener; }, close: vi.fn()};
    const create = vi.fn().mockReturnValue(source);
    const onMessage = vi.fn();
    subscribeToStaffConversation({inquiryId: "inquiry-1", afterCursor: -1, onCustomerTyping: vi.fn(), onMessage}, create);
    listeners.message!({lastEventId: "invalid", data: "{}"} as MessageEvent<string>);
    expect(onMessage).not.toHaveBeenCalled();

    expect(subscribeToStaffConversation({inquiryId: "../other", afterCursor: -1, onCustomerTyping: vi.fn(), onMessage: vi.fn()}, create)).toBeNull();
    expect(subscribeToStaffConversation({inquiryId: "inquiry-1", afterCursor: -2, onCustomerTyping: vi.fn(), onMessage: vi.fn()}, create)).toBeNull();
  });
});
