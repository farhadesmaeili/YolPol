import type {ConversationAgentKnowledgeRepository} from "@/features/conversation-ai-agent/application/ports/conversation-agent-ports";
import type {ConversationAgentEscalationReason} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";
import type {Locale} from "@/shared/types/locale";

export class CreateConversationAgentEscalation {
  constructor(private readonly knowledge: ConversationAgentKnowledgeRepository) {}

  async execute(locale: Locale, reason: ConversationAgentEscalationReason) {
    return Object.freeze({type: "ESCALATE" as const, body: await this.knowledge.getStaffReviewResponse(locale, reason), reason});
  }
}
