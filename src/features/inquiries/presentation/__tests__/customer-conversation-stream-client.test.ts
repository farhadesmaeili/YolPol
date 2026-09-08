import {describe, expect, it, vi} from "vitest";

import type {CustomerConversationEventSource} from "@/features/inquiries/presentation/clients/customer-conversation-stream-client";
import {subscribeToCustomerConversation} from "@/features/inquiries/presentation/clients/customer-conversation-stream-client";
import {createInitialCustomerChatState, customerChatReducer} from "@/features/inquiries/presentation/state/customer-chat-reducer";

describe("Customer conversation stream client", () => {
  it("reports connection changes without replacing EventSource or changing delivery identity", () => {
    const listeners = new Map<string, (event: MessageEvent<string>) => void>();
    const createSource = vi.fn(() => ({addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => {listeners.set(type, listener);}, close: vi.fn()}));
    const reconnecting = vi.fn(); const typing = vi.fn();
    subscribeToCustomerConversation(vi.fn(), createSource, typing, reconnecting);
    listeners.get("error")!({} as MessageEvent<string>);
    expect(reconnecting).toHaveBeenLastCalledWith(true); expect(typing).toHaveBeenLastCalledWith(false);
    listeners.get("open")!({} as MessageEvent<string>);
    expect(reconnecting).toHaveBeenLastCalledWith(false); expect(createSource).toHaveBeenCalledOnce();
  });
  it("renders repaired and replayed SSE messages once in durable order", () => {
    let listener: ((event: MessageEvent<string>) => void) | undefined;
    let state = createInitialCustomerChatState();
    const subscription = subscribeToCustomerConversation((message) => {
      state = customerChatReducer(state, {type: "realtime_message_received", message});
    }, () => ({addEventListener: (_type, callback) => { listener = callback; }, close: vi.fn()}));
    for (const [position, resume] of [[25, 19], [25, 19], [20, 20], [25, 25]]) {
      listener!({lastEventId: String(resume), data: JSON.stringify({id: `message-${position}`, position, senderType: "AI_AGENT",
        channel: "WEBSITE", body: "Safe answer", createdAt: "2026-08-25T10:00:00.000Z"})} as MessageEvent<string>);
    }
    expect(state.messages.map(({id, position}) => ({id, position}))).toEqual([
      {id: "message-20", position: 20}, {id: "message-25", position: 25},
    ]);
    subscription!.close();
  });

  it("maps realtime messages safely and closes EventSource subscriptions", () => {
    let listener: ((event: MessageEvent<string>) => void) | undefined;
    const source: CustomerConversationEventSource = {addEventListener: (_type, value) => { listener = value; }, close: vi.fn()};
    const createEventSource = vi.fn().mockReturnValue(source);
    const onMessage = vi.fn();
    const subscription = subscribeToCustomerConversation(onMessage, createEventSource);

    expect(createEventSource).toHaveBeenCalledWith("/api/customer/conversation/stream");
    listener!({data: JSON.stringify({id: "message-1", senderType: "INTERNAL_USER", channel: "TELEGRAM", body: "Your quote is ready.", createdAt: "2026-08-25T10:00:00.000Z"})} as MessageEvent<string>);
    listener!({data: '{"id":"message-2","internal":"secret"}'} as MessageEvent<string>);
    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith({id: "message-1", body: "Your quote is ready.", sender: "support", createdAt: "2026-08-25T10:00:00.000Z"});
    subscription!.close();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("keeps the payload position when the SSE resume ID is held behind it", () => {
    let listener: ((event: MessageEvent<string>) => void) | undefined;
    const source: CustomerConversationEventSource = {addEventListener: (_type, value) => { listener = value; }, close: vi.fn()};
    const onMessage = vi.fn();
    subscribeToCustomerConversation(onMessage, () => source);
    listener!({lastEventId: "19", data: JSON.stringify({id: "message-25", position: 25, senderType: "AI_AGENT",
      channel: "WEBSITE", body: "Grounded answer", createdAt: "2026-08-25T10:00:00.000Z"})} as MessageEvent<string>);
    expect(onMessage).toHaveBeenCalledWith({id: "message-25", position: 25, body: "Grounded answer", sender: "support", createdAt: "2026-08-25T10:00:00.000Z"});
  });

  it("accepts only aggregate Staff typing events and rejects confidential identity fields", () => {
    const listeners = new Map<string, (event: MessageEvent<string>) => void>();
    const source: CustomerConversationEventSource = {addEventListener: (type, value) => { listeners.set(type, value); }, close: vi.fn()};
    const onTyping = vi.fn();
    subscribeToCustomerConversation(vi.fn(), () => source, onTyping);
    listeners.get("typing")!({data: '{"participant":"STAFF","isTyping":true}'} as MessageEvent<string>);
    listeners.get("typing")!({data: '{"participant":"STAFF","isTyping":true,"actorReference":"staff:admin-main"}'} as MessageEvent<string>);
    expect(onTyping).toHaveBeenCalledOnce();
    expect(onTyping).toHaveBeenCalledWith(true);
  });
});
