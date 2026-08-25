import {conversationChannels, messageSenderTypes} from "@/features/inquiries/domain/types/conversation-types";
import type {CustomerChatMessage} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";

export type SendCustomerMessageInput = Readonly<{inquiryId: string; message: string}>;
export type SendCustomerMessageResult =
  | Readonly<{status: "created"; messageId: string}>
  | Readonly<{status: "validation_error"}>
  | Readonly<{status: "rate_limited"}>
  | Readonly<{status: "network_error"}>
  | Readonly<{status: "unavailable"}>;
export type LoadCustomerMessageHistoryResult =
  | Readonly<{status: "loaded"; messages: readonly CustomerChatMessage[]}>
  | Readonly<{status: "rate_limited"}>
  | Readonly<{status: "network_error"}>
  | Readonly<{status: "unavailable"}>;

const opaqueIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const messageIdPattern = /^[A-Za-z0-9_-]{1,160}$/u;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isExactCreatedResponse(value: unknown): value is Readonly<{status: "created"; messageId: string}> {
  if (!isPlainRecord(value)) return false;
  const record = value;
  return Object.keys(record).sort().join(",") === "messageId,status"
    && record.status === "created"
    && typeof record.messageId === "string"
    && opaqueIdPattern.test(record.messageId);
}

function parseHistoryMessage(value: unknown): CustomerChatMessage | null {
  if (!isPlainRecord(value) || Object.keys(value).sort().join(",") !== "body,channel,createdAt,id,senderType") return null;
  if (typeof value.id !== "string" || !messageIdPattern.test(value.id)) return null;
  const senderType = messageSenderTypes.find((candidate) => candidate === value.senderType);
  const channel = conversationChannels.find((candidate) => candidate === value.channel);
  if (!senderType || !channel) return null;
  if (typeof value.body !== "string" || value.body.length < 1 || value.body.length > 10_000) return null;
  if (typeof value.createdAt !== "string") return null;
  const createdAt = new Date(value.createdAt);
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== value.createdAt) return null;
  return Object.freeze({id: value.id, body: value.body, sender: senderType === "CUSTOMER" ? "customer" : "support"});
}

async function parseCustomerMessageHistoryResponse(response: Response): Promise<LoadCustomerMessageHistoryResult> {
  if (response.status === 429) return {status: "rate_limited"};
  if (response.status !== 200 || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return {status: "unavailable"};

  try {
    const value: unknown = await response.json();
    if (!isPlainRecord(value) || Object.keys(value).join(",") !== "messages" || !Array.isArray(value.messages)) return {status: "unavailable"};
    const messages: CustomerChatMessage[] = [];
    for (const entry of value.messages) {
      const message = parseHistoryMessage(entry);
      if (!message) return {status: "unavailable"};
      messages.push(message);
    }
    return {status: "loaded", messages: Object.freeze(messages)};
  } catch {
    return {status: "unavailable"};
  }
}

async function parseCustomerMessageResponse(response: Response): Promise<SendCustomerMessageResult> {
  if (response.status === 422) return {status: "validation_error"};
  if (response.status === 429) return {status: "rate_limited"};
  if (response.status !== 201 || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return {status: "unavailable"};

  try {
    const value: unknown = await response.json();
    return isExactCreatedResponse(value) ? {status: "created", messageId: value.messageId} : {status: "unavailable"};
  } catch {
    return {status: "unavailable"};
  }
}

export async function sendCustomerMessage(
  input: SendCustomerMessageInput,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<SendCustomerMessageResult> {
  if (!opaqueIdPattern.test(input.inquiryId)) return {status: "unavailable"};

  try {
    const response = await fetcher(`/api/inquiries/${encodeURIComponent(input.inquiryId)}/messages`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message: input.message}),
      signal,
    });
    return parseCustomerMessageResponse(response);
  } catch {
    return {status: "network_error"};
  }
}

export async function loadCustomerMessageHistory(
  inquiryId: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<LoadCustomerMessageHistoryResult> {
  if (!opaqueIdPattern.test(inquiryId)) return {status: "unavailable"};

  try {
    const response = await fetcher(`/api/inquiries/${encodeURIComponent(inquiryId)}/messages`, {
      method: "GET",
      headers: {Accept: "application/json"},
      signal,
    });
    return parseCustomerMessageHistoryResponse(response);
  } catch {
    return {status: "network_error"};
  }
}
