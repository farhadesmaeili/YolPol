import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";
import {ConversationId} from "@/features/inquiries/domain/value-objects/conversation-id";

const lookupPattern = /^[a-f0-9]{64}$/u;
const hashPattern = /^[a-f0-9]{64}$/u;

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export type ConversationAccessCredentialInput = Readonly<{
  conversationId: string;
  tokenLookup: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt?: Date;
}>;

export class ConversationAccessCredential {
  private constructor(
    readonly conversationId: ConversationId,
    readonly tokenLookup: string,
    readonly tokenHash: string,
    private readonly _createdAt: Date,
    private readonly _expiresAt?: Date,
  ) {}

  static create(input: ConversationAccessCredentialInput): ConversationAccessCredential {
    const conversationId = ConversationId.create(input.conversationId);
    if (!lookupPattern.test(input.tokenLookup)) throw new ConversationValidationError("tokenLookup", "Conversation access lookup has an invalid format.");
    if (!hashPattern.test(input.tokenHash)) throw new ConversationValidationError("tokenHash", "Conversation access hash has an invalid format.");
    if (!validDate(input.createdAt)) throw new ConversationValidationError("createdAt", "Conversation access creation time is invalid.");
    if (input.expiresAt !== undefined && (!validDate(input.expiresAt) || input.expiresAt <= input.createdAt)) throw new ConversationValidationError("expiresAt", "Conversation access expiration time is invalid.");
    return new ConversationAccessCredential(conversationId, input.tokenLookup, input.tokenHash, new Date(input.createdAt), input.expiresAt ? new Date(input.expiresAt) : undefined);
  }

  get createdAt(): Date { return new Date(this._createdAt); }
  get expiresAt(): Date | undefined { return this._expiresAt ? new Date(this._expiresAt) : undefined; }
}
