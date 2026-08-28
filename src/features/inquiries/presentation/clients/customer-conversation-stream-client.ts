import {parseCustomerChatMessage} from "@/features/inquiries/presentation/clients/customer-message-client";
import {parseConversationTypingEvent} from "@/features/inquiries/presentation/clients/conversation-typing-client";
import type {CustomerChatMessage} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";

export interface CustomerConversationEventSource {
  addEventListener(type: "message" | "typing", listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export type CustomerConversationStreamSubscription = Readonly<{close(): void}>;

export function subscribeToCustomerConversation(
  onMessage: (message: CustomerChatMessage) => void,
  createEventSource: (url: string) => CustomerConversationEventSource = (url) => new EventSource(url),
  onStaffTyping?: (isTyping: boolean) => void,
): CustomerConversationStreamSubscription | null {
  let source: CustomerConversationEventSource;
  try { source = createEventSource("/api/customer/conversation/stream"); }
  catch { return null; }

  source.addEventListener("message", (event) => {
    try {
      const message = parseCustomerChatMessage(JSON.parse(event.data) as unknown);
      if (message) onMessage(message);
    } catch { /* EventSource reconnects automatically; malformed events stay presentation-safe. */ }
  });
  if (onStaffTyping) {
    source.addEventListener("typing", (event) => {
      try {
        const isTyping = parseConversationTypingEvent(JSON.parse(event.data) as unknown, "STAFF");
        if (isTyping !== null) onStaffTyping(isTyping);
      } catch { /* Malformed ephemeral events never affect persisted message delivery. */ }
    });
  }
  return Object.freeze({close: () => source.close()});
}
