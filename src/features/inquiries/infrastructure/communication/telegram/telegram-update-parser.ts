import type {ExternalChannelReply} from "@/features/inquiries/application/dto/notification-message";

type UnknownRecord = Readonly<Record<string, unknown>>;

export type TelegramUpdateClassification =
  | Readonly<{status: "actionable"; reply: ExternalChannelReply}>
  | Readonly<{status: "ignored"}>
  | Readonly<{status: "invalid"}>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
}

function safeInteger(value: unknown, minimum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : null;
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
  const repliedMessageId = safeInteger(repliedMessage?.message_id, 1);
  const replyBody = typeof message?.text === "string" ? message.text.trim() : null;

  if (updateId === null || messageId === null || senderId === null || chatId === null || repliedMessageId === null) return null;
  if (!replyBody || replyBody.length > 10_000) return null;

  return Object.freeze({
    externalUpdateId: String(updateId),
    externalMessageId: `${chatId}:${messageId}`,
    externalRecipientId: String(chatId),
    senderExternalId: String(senderId),
    body: replyBody,
    repliedMessageId: String(repliedMessageId),
  });
}

export function classifyTelegramUpdate(input: unknown): TelegramUpdateClassification {
  const update = record(input);
  const updateId = safeInteger(update?.update_id, 0);
  if (!update || updateId === null) return {status: "invalid"};

  const payloadFields = Object.keys(update).filter((field) => field !== "update_id");
  if (payloadFields.length !== 1) return {status: "invalid"};

  const reply = parseTelegramUpdate(input);
  return reply ? {status: "actionable", reply} : {status: "ignored"};
}
