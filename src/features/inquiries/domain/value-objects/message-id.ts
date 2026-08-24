import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";

const idPattern = /^[A-Za-z0-9_-]{1,160}$/u;

export class MessageId {
  private constructor(readonly value: string) {}
  static create(value: unknown): MessageId {
    if (typeof value !== "string" || !idPattern.test(value)) throw new ConversationValidationError("message.id", "Message ID has an invalid format.");
    return new MessageId(value);
  }
}
