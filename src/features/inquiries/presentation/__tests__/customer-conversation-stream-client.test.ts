import {describe, expect, it, vi} from "vitest";

import type {CustomerConversationEventSource} from "@/features/inquiries/presentation/clients/customer-conversation-stream-client";
import {subscribeToCustomerConversation} from "@/features/inquiries/presentation/clients/customer-conversation-stream-client";

const accessToken = `ypc_${"A".repeat(43)}`;

describe("Customer conversation stream client", () => {
  it("maps realtime messages safely and closes EventSource subscriptions", () => {
    let listener: ((event: MessageEvent<string>) => void) | undefined;
    const source: CustomerConversationEventSource = {addEventListener: (_type, value) => { listener = value; }, close: vi.fn()};
    const createEventSource = vi.fn().mockReturnValue(source);
    const onMessage = vi.fn();
    const subscription = subscribeToCustomerConversation(accessToken, onMessage, createEventSource);

    expect(createEventSource).toHaveBeenCalledWith(`/api/conversations/${accessToken}/stream`);
    listener!({data: JSON.stringify({id: "message-1", senderType: "INTERNAL_USER", channel: "TELEGRAM", body: "Your quote is ready.", createdAt: "2026-08-25T10:00:00.000Z"})} as MessageEvent<string>);
    listener!({data: '{"id":"message-2","internal":"secret"}'} as MessageEvent<string>);
    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith({id: "message-1", body: "Your quote is ready.", sender: "support"});
    subscription!.close();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("does not open an EventSource for an unsafe token", () => {
    const createEventSource = vi.fn();
    expect(subscribeToCustomerConversation("../private", vi.fn(), createEventSource)).toBeNull();
    expect(createEventSource).not.toHaveBeenCalled();
  });
});
