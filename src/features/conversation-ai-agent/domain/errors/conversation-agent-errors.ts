export class ConversationAgentExecutionError extends Error {
  constructor(readonly category: string) { super("Conversation Agent execution failed."); this.name = "ConversationAgentExecutionError"; }
}
