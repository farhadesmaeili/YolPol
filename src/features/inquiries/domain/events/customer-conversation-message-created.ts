export const customerConversationMessageCreatedEventType = "CustomerConversationMessageCreated" as const;

export type CustomerConversationMessageCreated = Readonly<{
  eventId: string;
  type: typeof customerConversationMessageCreatedEventType;
  inquiryId: string;
  conversationId: string;
  messageId: string;
  occurredAt: Date;
}>;

export function createCustomerConversationMessageCreated(input: Readonly<{
  eventId: string;
  inquiryId: string;
  conversationId: string;
  messageId: string;
  occurredAt: Date;
}>): CustomerConversationMessageCreated {
  return Object.freeze({
    ...input,
    type: customerConversationMessageCreatedEventType,
    occurredAt: new Date(input.occurredAt),
  });
}
