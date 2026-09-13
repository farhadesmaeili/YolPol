import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";

export const messageBodyMaxLength = 10_000;

export function normalizeMessageBody(value: unknown): string {
  if (typeof value !== "string") throw new ConversationValidationError("message.body", "Message body must be a string.");
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > messageBodyMaxLength) throw new ConversationValidationError("message.body", `Message body must contain between 1 and ${messageBodyMaxLength} characters.`);
  return normalized;
}
