import type {ExternalChannelReply} from "@/features/inquiries/application/dto/notification-message";

type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
}

function safeInteger(value: unknown, minimum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : null;
}

function inquiryIdFromNotification(body: string): string | null {
  const matches = [...body.matchAll(/^\s*Inquiry(?:\s+#|:)\s*([A-Za-z0-9_-]{1,128})\s*$/gmu)];
  return matches.length === 1 ? matches[0]?.[1] ?? null : null;
}

export function parseTelegramUpdate(input: unknown): ExternalChannelReply | null {
  const update = record(input);
  const updateId = safeInteger(update?.update_id, 0);
  const message = record(update?.message);
  const messageId = safeInteger(message?.message_id, 1);
  const sender = record(message?.from);
  const senderId = safeInteger(sender?.id, 1);
  const chat = record(message?.chat);
  const chatId = safeInteger(chat?.id, Number.MIN_SAFE_INTEGER);
  const repliedMessage = record(message?.reply_to_message);
  const repliedMessageBody = typeof repliedMessage?.text === "string" ? repliedMessage.text : typeof repliedMessage?.caption === "string" ? repliedMessage.caption : null;
  const replyBody = typeof message?.text === "string" ? message.text.trim() : null;

  if (updateId === null || messageId === null || senderId === null || chatId === null) return null;
  if (!replyBody || replyBody.length > 10_000 || !repliedMessageBody) return null;
  const inquiryId = inquiryIdFromNotification(repliedMessageBody);
  if (!inquiryId) return null;

  return Object.freeze({
    externalUpdateId: String(updateId),
    externalMessageId: `${chatId}:${messageId}`,
    externalRecipientId: String(chatId),
    senderExternalId: String(senderId),
    body: replyBody,
    repliedMessageBody,
    inquiryId,
  });
}
