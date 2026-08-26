import type {ConversationTypingParticipant, ConversationTypingRegistry} from "@/features/inquiries/application/ports/conversation-typing-ports";
import type {UpdateConversationTypingResult} from "@/features/inquiries/application/results/update-conversation-typing-result";
import {ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";
import {ConversationId} from "@/features/inquiries/domain/value-objects/conversation-id";

const actorKeyPattern = /^[A-Za-z0-9:_-]{1,160}$/u;

export class UpdateConversationTyping {
  constructor(private readonly registry: ConversationTypingRegistry) {}

  execute(input: Readonly<{
    conversationId: string;
    participant: ConversationTypingParticipant;
    actorKey: string;
    isTyping: boolean;
  }>): UpdateConversationTypingResult {
    let conversationId: string;
    try { conversationId = ConversationId.create(input.conversationId).value; }
    catch (error) {
      if (error instanceof ConversationValidationError) return {status: "validation_failed"};
      throw error;
    }
    if (!actorKeyPattern.test(input.actorKey) || typeof input.isTyping !== "boolean") return {status: "validation_failed"};

    try {
      this.registry.update({...input, conversationId});
      return {status: "updated"};
    } catch {
      return {status: "dependency_failed"};
    }
  }
}
