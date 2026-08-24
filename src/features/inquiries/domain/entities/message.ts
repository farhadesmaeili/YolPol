import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";
import {conversationChannels, messageSenderTypes, type ConversationChannel, type MessageCreateInput, type MessageSenderType} from "@/features/inquiries/domain/types/conversation-types";
import {MessageId} from "@/features/inquiries/domain/value-objects/message-id";

function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }

export class Message {
  private constructor(readonly id: MessageId, readonly senderType: MessageSenderType, readonly channel: ConversationChannel, readonly body: string, private readonly _createdAt: Date) {}

  static create(input: MessageCreateInput): Message {
    const id = MessageId.create(input.id);
    if (!messageSenderTypes.includes(input.senderType)) throw new ConversationValidationError("message.senderType", "Unsupported message sender type.");
    if (!conversationChannels.includes(input.channel)) throw new ConversationValidationError("message.channel", "Unsupported message channel.");
    if (typeof input.body !== "string" || input.body.trim().length < 1 || input.body.trim().length > 10_000) throw new ConversationValidationError("message.body", "Message body must contain between 1 and 10000 characters.");
    if (!validDate(input.createdAt)) throw new ConversationValidationError("message.createdAt", "Message creation time is invalid.");
    return new Message(id, input.senderType, input.channel, input.body.trim(), new Date(input.createdAt));
  }

  get createdAt(): Date { return new Date(this._createdAt); }
}
