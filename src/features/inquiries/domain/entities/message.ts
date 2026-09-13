import {isSupportedLocale, type Locale} from "@/shared/types/locale";
import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";
import {conversationChannels, messageSenderTypes, type ConversationChannel, type MessageCreateInput, type MessageSenderType} from "@/features/inquiries/domain/types/conversation-types";
import {normalizeMessageBody} from "@/features/inquiries/domain/validation/message-input-validation";
import {ConversationActorReference} from "@/features/inquiries/domain/value-objects/conversation-actor-reference";
import {MessageId} from "@/features/inquiries/domain/value-objects/message-id";

function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }

export class Message {
  private constructor(
    readonly id: MessageId,
    readonly senderType: MessageSenderType,
    readonly channel: ConversationChannel,
    readonly actorReference: ConversationActorReference | null,
    readonly body: string,
    readonly sourceLocale: Locale | null,
    private readonly _createdAt: Date,
  ) {}

  static create(input: MessageCreateInput): Message {
    const id = MessageId.create(input.id);
    if (input.sourceLocale != null && !isSupportedLocale(input.sourceLocale)) throw new ConversationValidationError("message.sourceLocale", "Unsupported source locale.");
    if (!messageSenderTypes.includes(input.senderType)) throw new ConversationValidationError("message.senderType", "Unsupported message sender type.");
    if (!conversationChannels.includes(input.channel)) throw new ConversationValidationError("message.channel", "Unsupported message channel.");
    const actorReference = ConversationActorReference.create(input.actorReference);
    const body = normalizeMessageBody(input.body);
    if (!validDate(input.createdAt)) throw new ConversationValidationError("message.createdAt", "Message creation time is invalid.");
    return new Message(id, input.senderType, input.channel, actorReference, body, input.sourceLocale ?? null, new Date(input.createdAt));
  }

  get createdAt(): Date { return new Date(this._createdAt); }
}
