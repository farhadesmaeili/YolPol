export type TelegramStartCommand = Readonly<{
  externalUpdateId: string;
  telegramUserId: string | null;
  chatId: string | null;
  chatType: string | null;
  languageCode: string | null;
  connectionToken: string | null;
  malformed: boolean;
  senderEligible: boolean;
}>;
