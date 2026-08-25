export type NotificationMessage = Readonly<{
  subject: string;
  body: string;
}>;

export type ExternalChannelReply = Readonly<{
  externalMessageId: string;
  externalRecipientId: string;
  senderExternalId: string;
  body: string;
  receivedAt: Date;
}>;
