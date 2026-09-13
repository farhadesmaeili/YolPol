import {ConversationStateError, ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";
import {Message} from "@/features/inquiries/domain/entities/message";
import {conversationChannels, type ConversationChannel, type ConversationCreateInput, type ConversationReconstitutionInput, type MessageCreateInput} from "@/features/inquiries/domain/types/conversation-types";
import {ConversationId} from "@/features/inquiries/domain/value-objects/conversation-id";
import {InquiryId} from "@/features/inquiries/domain/value-objects/inquiry-id";

function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }

export class Conversation {
  private constructor(readonly id: ConversationId, readonly inquiryId: InquiryId, readonly channel: ConversationChannel, private readonly _createdAt: Date, private readonly _messages: Message[]) {}

  static start(input: ConversationCreateInput): Conversation { return Conversation.build({...input, messages: []}); }
  static reconstitute(input: ConversationReconstitutionInput): Conversation { return Conversation.build(input); }

  private static build(input: ConversationReconstitutionInput): Conversation {
    const id = ConversationId.create(input.id);
    const inquiryId = InquiryId.create(input.inquiryId);
    if (!conversationChannels.includes(input.channel)) throw new ConversationValidationError("channel", "Unsupported conversation channel.");
    if (!validDate(input.createdAt)) throw new ConversationValidationError("createdAt", "Conversation creation time is invalid.");
    const createdAt = new Date(input.createdAt);
    const messages = input.messages.map((entry) => Message.create(entry));
    if (new Set(messages.map(({id: messageId}) => messageId.value)).size !== messages.length) throw new ConversationValidationError("messages", "Duplicate message IDs are not allowed.");
    if (messages.some((message) => message.createdAt < createdAt)) throw new ConversationValidationError("messages.createdAt", "A message cannot predate its conversation.");
    if (messages.some((message, index) => index > 0 && message.createdAt < messages[index - 1].createdAt)) throw new ConversationValidationError("messages.createdAt", "Messages must be in chronological order.");
    return new Conversation(id, inquiryId, input.channel, createdAt, messages);
  }

  addMessage(input: MessageCreateInput): void {
    const message = Message.create(input);
    if (this._messages.some(({id}) => id.value === message.id.value)) throw new ConversationStateError("Message ID already exists in this conversation.");
    const latest = this._messages.at(-1)?.createdAt ?? this._createdAt;
    if (message.createdAt < latest) throw new ConversationStateError("Messages cannot be added out of chronological order.");
    this._messages.push(message);
  }

  get createdAt(): Date { return new Date(this._createdAt); }
  get messages(): readonly Message[] { return Object.freeze([...this._messages]); }
}
