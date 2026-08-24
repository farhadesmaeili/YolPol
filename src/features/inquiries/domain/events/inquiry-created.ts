export const inquiryCreatedEventType = "InquiryCreated" as const;

export type InquiryCreated = Readonly<{
  eventId: string;
  type: typeof inquiryCreatedEventType;
  inquiryId: string;
  occurredAt: Date;
}>;

export function createInquiryCreated(inquiryId: string, occurredAt: Date): InquiryCreated {
  return Object.freeze({eventId: `${inquiryId}-created`, type: inquiryCreatedEventType, inquiryId, occurredAt: new Date(occurredAt)});
}
