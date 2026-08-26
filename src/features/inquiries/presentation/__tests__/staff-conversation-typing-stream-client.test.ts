import {describe, expect, it, vi} from "vitest";

import type {StaffConversationTypingEventSource} from "@/features/inquiries/presentation/clients/staff-conversation-typing-stream-client";
import {subscribeToStaffConversationTyping} from "@/features/inquiries/presentation/clients/staff-conversation-typing-stream-client";

describe("Staff conversation typing stream client", () => {
  it("opens the authenticated inquiry stream, parses customer transitions, and closes", () => {
    let listener: ((event: MessageEvent<string>) => void) | undefined;
    const source: StaffConversationTypingEventSource = {addEventListener: (_type, value) => { listener = value; }, close: vi.fn()};
    const create = vi.fn().mockReturnValue(source);
    const onTyping = vi.fn();
    const subscription = subscribeToStaffConversationTyping("inquiry-1", onTyping, create);
    expect(create).toHaveBeenCalledWith("/api/staff/inquiries/inquiry-1/stream");
    listener!({data: '{"participant":"CUSTOMER","isTyping":true}'} as MessageEvent<string>);
    listener!({data: '{"participant":"CUSTOMER","isTyping":false}'} as MessageEvent<string>);
    listener!({data: '{"participant":"CUSTOMER","isTyping":true,"conversationId":"other"}'} as MessageEvent<string>);
    expect(onTyping.mock.calls.map(([value]) => value)).toEqual([true, false]);
    subscription!.close();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("rejects unsafe inquiry identifiers before opening a stream", () => {
    const create = vi.fn();
    expect(subscribeToStaffConversationTyping("../other", vi.fn(), create)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
