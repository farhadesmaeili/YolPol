export type NotificationMessage = Readonly<{
  text: string;
}>;

export type ExternalChannelReply = Readonly<{
  externalUpdateId: string;
  externalMessageId: string;
  externalRecipientId: string;
  senderExternalId: string;
  body: string;
  repliedMessageId: string;
}>;
