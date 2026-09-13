import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";
import {parseConversationTypingEvent} from "@/features/inquiries/presentation/clients/conversation-typing-client";
import {parseStaffConversationMessage} from "@/features/inquiries/presentation/clients/staff-conversation-reply-client";

export interface StaffConversationEventSource {
  addEventListener(type: "message" | "typing", listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export type StaffConversationStreamSubscription = Readonly<{close(): void}>;

const inquiryIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const maximumConversationCursor = 2_147_483_647;

function parseConversationCursor(value: string): number | null {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor <= maximumConversationCursor ? cursor : null;
}

export function subscribeToStaffConversation(
  input: Readonly<{
    inquiryId: string;
    afterCursor: number;
    onCustomerTyping(isTyping: boolean): void;
    onMessage(update: ConversationMessageUpdate<StaffConversationMessageDto>): void;
  }>,
  createEventSource: (url: string) => StaffConversationEventSource = (url) => new EventSource(url),
): StaffConversationStreamSubscription | null {
  if (!inquiryIdPattern.test(input.inquiryId)
    || !Number.isSafeInteger(input.afterCursor)
    || input.afterCursor < -1
    || input.afterCursor > maximumConversationCursor) return null;

  let source: StaffConversationEventSource;
  try {
    const path = `/api/staff/inquiries/${encodeURIComponent(input.inquiryId)}/stream`;
    source = createEventSource(`${path}?cursor=${input.afterCursor}`);
  } catch { return null; }

  source.addEventListener("typing", (event) => {
    try {
      const isTyping = parseConversationTypingEvent(JSON.parse(event.data) as unknown, "CUSTOMER");
      if (isTyping !== null) input.onCustomerTyping(isTyping);
    } catch { /* EventSource reconnect and server TTL handle transient failures. */ }
  });
  source.addEventListener("message", (event) => {
    try {
      const cursor = parseConversationCursor(event.lastEventId);
      const message = parseStaffConversationMessage(JSON.parse(event.data) as unknown);
      if (cursor !== null && message) input.onMessage(Object.freeze({cursor, message}));
    } catch { /* Invalid frames are ignored; EventSource reconnect resumes from the last valid SSE id. */ }
  });
  return Object.freeze({close: () => source.close()});
}
