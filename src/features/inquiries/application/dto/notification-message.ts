export type NotificationMessage = Readonly<{
  subject: string;
  body: string;
}>;

export type ExternalChannelReply = Readonly<{
  externalUpdateId: string;
  externalMessageId: string;
  externalRecipientId: string;
  senderExternalId: string;
  body: string;
  repliedMessageBody: string;
  inquiryId: string;
}>;
