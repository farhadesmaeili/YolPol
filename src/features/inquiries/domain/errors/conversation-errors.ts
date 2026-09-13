export class ConversationValidationError extends Error {
  readonly name = "ConversationValidationError";
  constructor(readonly field: string, message: string) { super(message); }
}

export class ConversationStateError extends Error { readonly name = "ConversationStateError"; }
