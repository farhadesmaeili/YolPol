import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";

export const conversationActorReferenceMaxLength = 160;

export class ConversationActorReference {
  private constructor(readonly value: string) {}

  static create(value: unknown): ConversationActorReference | null {
    if (value === null || value === undefined) return null;
    if (
      typeof value !== "string"
      || value !== value.trim()
      || value.length < 1
      || value.length > conversationActorReferenceMaxLength
      || /[\u0000-\u001F\u007F]/u.test(value)
    ) {
      throw new ConversationValidationError("message.actorReference", "Message actor reference is invalid.");
    }
    return new ConversationActorReference(value);
  }
}
