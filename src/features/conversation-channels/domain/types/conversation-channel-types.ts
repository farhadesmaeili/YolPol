export const externalConversationChannels = ["TELEGRAM", "INSTAGRAM", "EMAIL", "WHATSAPP"] as const;
export type ExternalConversationChannel = (typeof externalConversationChannels)[number];

export const conversationChannelDeliveryStatuses = ["PENDING", "RUNNING", "DELIVERED", "FAILED", "UNKNOWN"] as const;
export type ConversationChannelDeliveryStatus = (typeof conversationChannelDeliveryStatuses)[number];

export const conversationChannelFailureCategories = [
  "AUTHENTICATION",
  "AUTHORIZATION",
  "DESTINATION_NOT_FOUND",
  "INVALID_REQUEST",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "TIMEOUT",
  "MALFORMED_RESPONSE",
  "INFRASTRUCTURE_FAILURE",
  "UNKNOWN_OUTCOME",
] as const;
export type ConversationChannelFailureCategory = (typeof conversationChannelFailureCategories)[number];

export type ConversationChannelBindingIdentity = Readonly<{
  channel: ExternalConversationChannel;
  providerKey: string;
  externalAccountReference: string;
  externalConversationReference: string;
  externalParticipantReference: string;
}>;

export type ConversationChannelBindingInput = Readonly<{
  id: unknown;
  conversationId: unknown;
  channel: unknown;
  providerKey: unknown;
  externalAccountReference: unknown;
  externalConversationReference: unknown;
  externalParticipantReference: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}>;

export type ConversationChannelBindingSnapshot = ConversationChannelBindingIdentity & Readonly<{
  id: string;
  conversationId: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type NormalizedInboundChannelText = ConversationChannelBindingIdentity & Readonly<{
  externalMessageReference: string;
  body: string;
  occurredAt: Date;
}>;

export type NormalizedInboundChannelTextInput = Readonly<{
  channel: unknown;
  providerKey: unknown;
  externalAccountReference: unknown;
  externalConversationReference: unknown;
  externalParticipantReference: unknown;
  externalMessageReference: unknown;
  body: unknown;
  occurredAt: unknown;
}>;

export type ClaimedConversationChannelDelivery = ConversationChannelBindingIdentity & Readonly<{
  id: string;
  conversationId: string;
  messageId: string;
  body: string;
  attempts: number;
  leaseToken: string;
  leasedUntil: Date;
}>;

export type ConversationChannelSendTextResult =
  | Readonly<{status: "DELIVERED"; providerMessageReference: string}>
  | Readonly<{status: "RETRYABLE_FAILURE" | "PERMANENT_FAILURE" | "UNKNOWN"; failureCategory: ConversationChannelFailureCategory}>;
