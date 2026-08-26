import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import {conversationChannels, messageSenderTypes} from "@/features/inquiries/domain/types/conversation-types";
import {messageBodyMaxLength} from "@/features/inquiries/domain/validation/message-input-validation";

export type StaffConversationReplyFailure =
  | "invalid_message"
  | "session_expired"
  | "permission_denied"
  | "conversation_unavailable"
  | "retry_conflict"
  | "message_too_large"
  | "unsupported_request"
  | "rate_limited"
  | "service_unavailable";

export type SendStaffConversationReplyResult =
  | Readonly<{status: "sent"; message: StaffConversationMessageDto}>
  | Readonly<{status: "failed"; failure: StaffConversationReplyFailure}>;

type StaffConversationReplyFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const messageIdPattern = /^[A-Za-z0-9_-]{1,160}$/u;
const actorReferencePattern = /^[^\u0000-\u001F\u007F]{1,160}$/u;

export type StaffClientCrypto = Readonly<{
  randomUUID: (() => string) | undefined;
  getRandomValues: ((array: Uint8Array) => Uint8Array) | undefined;
}>;

export class StaffClientCryptoUnavailableError extends Error {
  readonly name = "StaffClientCryptoUnavailableError";

  constructor() {
    super("Secure browser randomness is unavailable.");
  }
}

function uuidV4FromBytes(bytes: Uint8Array): string {
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createStaffClientMessageId(
  cryptoProvider: StaffClientCrypto | null = globalThis.crypto,
): string {
  if (typeof cryptoProvider?.randomUUID === "function") return cryptoProvider.randomUUID();
  if (typeof cryptoProvider?.getRandomValues !== "function") throw new StaffClientCryptoUnavailableError();

  const bytes = new Uint8Array(16);
  cryptoProvider.getRandomValues(bytes);
  return uuidV4FromBytes(bytes);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function parseStaffConversationMessage(value: unknown): StaffConversationMessageDto | null {
  if (!isPlainRecord(value) || Object.keys(value).sort().join(",") !== "actorReference,body,channel,createdAt,id,senderType") return null;
  if (typeof value.id !== "string" || !messageIdPattern.test(value.id)) return null;
  const senderType = messageSenderTypes.find((candidate) => candidate === value.senderType);
  const channel = conversationChannels.find((candidate) => candidate === value.channel);
  if (!senderType || !channel) return null;
  if (typeof value.body !== "string" || value.body.length < 1 || value.body.length > messageBodyMaxLength) return null;
  if (value.actorReference !== null && (
    typeof value.actorReference !== "string"
    || value.actorReference.trim() !== value.actorReference
    || !actorReferencePattern.test(value.actorReference)
  )) return null;
  if (typeof value.createdAt !== "string") return null;
  const createdAt = new Date(value.createdAt);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== value.createdAt) return null;
  return Object.freeze({
    id: value.id,
    senderType,
    channel,
    actorReference: value.actorReference,
    body: value.body,
    createdAt: value.createdAt,
  });
}

async function parseResponse(response: Response): Promise<SendStaffConversationReplyResult> {
  switch (response.status) {
    case 400: return {status: "failed", failure: "invalid_message"};
    case 401: return {status: "failed", failure: "session_expired"};
    case 403: return {status: "failed", failure: "permission_denied"};
    case 404: return {status: "failed", failure: "conversation_unavailable"};
    case 409: return {status: "failed", failure: "retry_conflict"};
    case 413: return {status: "failed", failure: "message_too_large"};
    case 415: return {status: "failed", failure: "unsupported_request"};
    case 429: return {status: "failed", failure: "rate_limited"};
    case 503: return {status: "failed", failure: "service_unavailable"};
  }

  if ((response.status !== 200 && response.status !== 201)
    || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return {status: "failed", failure: "service_unavailable"};
  }

  try {
    const value: unknown = await response.json();
    if (!isPlainRecord(value) || Object.keys(value).sort().join(",") !== "message,status" || value.status !== "sent") {
      return {status: "failed", failure: "service_unavailable"};
    }
    const message = parseStaffConversationMessage(value.message);
    return message ? {status: "sent", message} : {status: "failed", failure: "service_unavailable"};
  } catch {
    return {status: "failed", failure: "service_unavailable"};
  }
}

export async function sendStaffConversationReply(
  input: Readonly<{inquiryId: string; body: string; clientMessageId: string}>,
  signal: AbortSignal,
  fetcher: StaffConversationReplyFetch = fetch,
): Promise<SendStaffConversationReplyResult> {
  try {
    const response = await fetcher(`/api/staff/inquiries/${encodeURIComponent(input.inquiryId)}/messages`, {
      method: "POST",
      headers: {Accept: "application/json", "Content-Type": "application/json"},
      body: JSON.stringify({body: input.body, clientMessageId: input.clientMessageId}),
      signal,
    });
    return parseResponse(response);
  } catch {
    return {status: "failed", failure: "service_unavailable"};
  }
}
