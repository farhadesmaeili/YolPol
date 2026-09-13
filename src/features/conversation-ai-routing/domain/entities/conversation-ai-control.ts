import {ConversationAiRoutingValidationError} from "@/features/conversation-ai-routing/domain/errors/conversation-ai-routing-errors";
import {conversationAiControlStates, type ConversationAiControlState} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";

const actorPattern = /^staff:[A-Za-z0-9_-]{1,128}$/u;

export class ConversationAiControl {
  private constructor(
    readonly conversationId: string,
    readonly state: ConversationAiControlState,
    readonly version: number,
    readonly updatedAt: Date,
    readonly updatedBy: string,
  ) { Object.freeze(this); }

  static restore(input: Readonly<{conversationId: string; state: string; version: number; updatedAt: Date; updatedBy: string}>): ConversationAiControl {
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(input.conversationId)) throw new ConversationAiRoutingValidationError("conversationId", "Conversation ID is invalid.");
    if (!(conversationAiControlStates as readonly string[]).includes(input.state)) throw new ConversationAiRoutingValidationError("state", "Conversation AI state is invalid.");
    if (!Number.isSafeInteger(input.version) || input.version < 1) throw new ConversationAiRoutingValidationError("version", "Conversation AI version is invalid.");
    if (!(input.updatedAt instanceof Date) || !Number.isFinite(input.updatedAt.getTime())) throw new ConversationAiRoutingValidationError("updatedAt", "Conversation AI update time is invalid.");
    if (!actorPattern.test(input.updatedBy)) throw new ConversationAiRoutingValidationError("updatedBy", "Conversation AI actor is invalid.");
    return new ConversationAiControl(input.conversationId, input.state as ConversationAiControlState, input.version, new Date(input.updatedAt), input.updatedBy);
  }
}
