import {parseConversationTypingEvent} from "@/features/inquiries/presentation/clients/conversation-typing-client";

export interface StaffConversationTypingEventSource {
  addEventListener(type: "typing", listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export type StaffConversationTypingStreamSubscription = Readonly<{close(): void}>;

const inquiryIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;

export function subscribeToStaffConversationTyping(
  inquiryId: string,
  onCustomerTyping: (isTyping: boolean) => void,
  createEventSource: (url: string) => StaffConversationTypingEventSource = (url) => new EventSource(url),
): StaffConversationTypingStreamSubscription | null {
  if (!inquiryIdPattern.test(inquiryId)) return null;
  let source: StaffConversationTypingEventSource;
  try { source = createEventSource(`/api/staff/inquiries/${encodeURIComponent(inquiryId)}/stream`); }
  catch { return null; }
  source.addEventListener("typing", (event) => {
    try {
      const isTyping = parseConversationTypingEvent(JSON.parse(event.data) as unknown, "CUSTOMER");
      if (isTyping !== null) onCustomerTyping(isTyping);
    } catch { /* EventSource reconnect and server TTL handle transient failures. */ }
  });
  return Object.freeze({close: () => source.close()});
}
