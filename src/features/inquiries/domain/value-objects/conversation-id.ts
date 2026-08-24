import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";

const idPattern = /^[A-Za-z0-9_-]{1,128}$/u;

export class ConversationId {
  private constructor(readonly value: string) {}
  static create(value: unknown): ConversationId {
    if (typeof value !== "string" || !idPattern.test(value)) throw new ConversationValidationError("id", "Conversation ID has an invalid format.");
    return new ConversationId(value);
  }
}
