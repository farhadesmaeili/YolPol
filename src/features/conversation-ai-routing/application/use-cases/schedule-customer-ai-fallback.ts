import type {AiOperationsFallbackPlanner, ConversationAiJobIdGenerator, CustomerMessageAiFallbackPlanner} from "@/features/conversation-ai-routing/application/ports/conversation-ai-routing-ports";
import {conversationAiExecutionId, parseConversationAiJobId} from "@/features/conversation-ai-routing/domain/services/conversation-ai-identities";

export class ScheduleCustomerAiFallback implements CustomerMessageAiFallbackPlanner {
  constructor(private readonly operations: AiOperationsFallbackPlanner, private readonly jobIds: ConversationAiJobIdGenerator) {}

  async plan(input: Readonly<{triggerMessageId: string; triggeredAt: Date}>) {
    try {
      const decision = await this.operations.execute({triggeredAt: input.triggeredAt});
      if (decision.status !== "scheduled") return null;
      const id = parseConversationAiJobId(this.jobIds.generate());
      return Object.freeze({
        id,
        triggerMessageId: input.triggerMessageId,
        notBefore: new Date(decision.notBefore),
        executionId: conversationAiExecutionId(id),
        createdAt: new Date(input.triggeredAt),
      });
    } catch { return null; }
  }
}
