export const conversationChannels = ["WEBSITE", "TELEGRAM", "EMAIL", "WHATSAPP"] as const;
export type ConversationChannel = (typeof conversationChannels)[number];

export const messageSenderTypes = ["CUSTOMER", "INTERNAL_USER", "AI_AGENT", "SYSTEM"] as const;
export type MessageSenderType = (typeof messageSenderTypes)[number];

export type MessageCreateInput = Readonly<{
  id: string;
  senderType: MessageSenderType;
  channel: ConversationChannel;
  body: string;
  createdAt: Date;
}>;

export type ConversationCreateInput = Readonly<{
  id: string;
  inquiryId: string;
  channel: ConversationChannel;
  createdAt: Date;
}>;

export type ConversationReconstitutionInput = ConversationCreateInput & Readonly<{
  messages: readonly MessageCreateInput[];
}>;
