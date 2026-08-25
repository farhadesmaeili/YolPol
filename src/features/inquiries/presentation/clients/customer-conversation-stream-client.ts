import {conversationAccessTokenPattern, parseCustomerChatMessage} from "@/features/inquiries/presentation/clients/customer-message-client";
import type {CustomerChatMessage} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";

export interface CustomerConversationEventSource {
  addEventListener(type: "message", listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export type CustomerConversationStreamSubscription = Readonly<{close(): void}>;

export function subscribeToCustomerConversation(
  accessToken: string,
  onMessage: (message: CustomerChatMessage) => void,
  createEventSource: (url: string) => CustomerConversationEventSource = (url) => new EventSource(url),
): CustomerConversationStreamSubscription | null {
  if (!conversationAccessTokenPattern.test(accessToken)) return null;

  let source: CustomerConversationEventSource;
  try { source = createEventSource(`/api/conversations/${encodeURIComponent(accessToken)}/stream`); }
  catch { return null; }

  source.addEventListener("message", (event) => {
    try {
      const message = parseCustomerChatMessage(JSON.parse(event.data) as unknown);
      if (message) onMessage(message);
    } catch { /* EventSource reconnects automatically; malformed events stay presentation-safe. */ }
  });
  return Object.freeze({close: () => source.close()});
}
