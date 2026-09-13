export class ConversationAiRoutingValidationError extends Error {
  constructor(readonly field: string, message: string) { super(message); this.name = "ConversationAiRoutingValidationError"; }
}

export class ConversationAiGenerationError extends Error {
  constructor(readonly category: string) { super("Conversation AI generation failed."); this.name = "ConversationAiGenerationError"; }
}
