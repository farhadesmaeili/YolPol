import type {ConversationAiResponseGenerator} from "@/features/conversation-ai-routing/application/ports/conversation-ai-routing-ports";
import type {ConversationAgentDecision} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";

export class FakeConversationAiResponseGenerator implements ConversationAiResponseGenerator {
  readonly requests: Parameters<ConversationAiResponseGenerator["generate"]>[0][] = [];
  result: ConversationAgentDecision = Object.freeze({type: "RESPOND", body: "Generated"});
  failure?: Error;

  async generate(input: Parameters<ConversationAiResponseGenerator["generate"]>[0]): Promise<ConversationAgentDecision> {
    this.requests.push(input);
    if (this.failure) throw this.failure;
    return this.result;
  }
}
