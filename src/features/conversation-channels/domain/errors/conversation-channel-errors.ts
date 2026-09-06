export class ConversationChannelValidationError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
    this.name = "ConversationChannelValidationError";
  }
}

export class ConversationChannelStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationChannelStateError";
  }
}
