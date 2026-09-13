export class ConversationTranslationControlValidationError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
    this.name = "ConversationTranslationControlValidationError";
  }
}
