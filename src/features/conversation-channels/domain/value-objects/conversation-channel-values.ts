import {ConversationChannelValidationError} from "@/features/conversation-channels/domain/errors/conversation-channel-errors";
import {conversationChannelFailureCategories, externalConversationChannels, type ConversationChannelFailureCategory, type ExternalConversationChannel} from "@/features/conversation-channels/domain/types/conversation-channel-types";
import {ConversationId} from "@/features/inquiries/domain/value-objects/conversation-id";
import {MessageId} from "@/features/inquiries/domain/value-objects/message-id";

export const conversationChannelInternalIdMaxLength = 128;
export const conversationChannelExternalReferenceMaxLength = 160;
export const conversationChannelTextMaxLength = 10_000;
export const conversationChannelMaximumDeliveryAttempts = 3;

const stableIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const providerKeyPattern = /^[a-z][a-z0-9_-]{0,63}$/u;
const externalReferencePattern = /^[^\s<>\u0000-\u001F\u007F]{1,160}$/u;
const urlSchemePattern = /^[a-z][a-z0-9+.-]*:\/\//iu;
const htmlTagPattern = /<\/?[a-z][^>]*>/iu;

export function parseConversationChannelInternalId(value: unknown, field: string): string {
  if (typeof value !== "string" || !stableIdPattern.test(value)) {
    throw new ConversationChannelValidationError(field, `${field} is invalid.`);
  }
  return value;
}

export function parseConversationChannelMessageId(value: unknown, field = "messageId"): string {
  try {
    return MessageId.create(value).value;
  } catch {
    throw new ConversationChannelValidationError(field, `${field} is invalid.`);
  }
}

export function parseConversationChannelConversationId(value: unknown): string {
  try {
    return ConversationId.create(value).value;
  } catch {
    throw new ConversationChannelValidationError("conversationId", "Conversation ID is invalid.");
  }
}

export function parseExternalConversationChannel(value: unknown): ExternalConversationChannel {
  if (typeof value !== "string" || !(externalConversationChannels as readonly string[]).includes(value)) {
    throw new ConversationChannelValidationError("channel", "External conversation channel is invalid.");
  }
  return value as ExternalConversationChannel;
}

export function parseConversationChannelProviderKey(value: unknown): string {
  if (typeof value !== "string" || !providerKeyPattern.test(value)) {
    throw new ConversationChannelValidationError("providerKey", "Provider key is invalid.");
  }
  return value;
}

export function parseConversationChannelExternalReference(value: unknown, field: string): string {
  if (typeof value !== "string" || !externalReferencePattern.test(value) || urlSchemePattern.test(value)) {
    throw new ConversationChannelValidationError(field, `${field} must be a bounded opaque identifier.`);
  }
  return value;
}

export function parseConversationChannelText(value: unknown): string {
  if (typeof value !== "string") throw new ConversationChannelValidationError("body", "Message body must be plain text.");
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (normalized.length < 1 || normalized.length > conversationChannelTextMaxLength
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)
    || htmlTagPattern.test(normalized)) {
    throw new ConversationChannelValidationError("body", "Message body must be bounded plain text without markup.");
  }
  return normalized;
}

export function parseConversationChannelDate(value: unknown, field: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new ConversationChannelValidationError(field, `${field} is invalid.`);
  }
  return new Date(value);
}

export function parseConversationChannelAttempts(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > conversationChannelMaximumDeliveryAttempts) {
    throw new ConversationChannelValidationError("attempts", "Delivery attempts are invalid.");
  }
  return value as number;
}

export function parseConversationChannelFailureCategory(value: unknown): ConversationChannelFailureCategory {
  if (typeof value !== "string" || !(conversationChannelFailureCategories as readonly string[]).includes(value)) {
    throw new ConversationChannelValidationError("failureCategory", "Failure category is invalid.");
  }
  return value as ConversationChannelFailureCategory;
}
