import type {ConversationAiGateway} from "@/features/conversation-ai-routing/application/ports/conversation-ai-routing-ports";
import type {AiProviderExecutionResult} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

export class FakeConversationAiGateway implements ConversationAiGateway {
  readonly requests: Parameters<ConversationAiGateway["execute"]>[0][] = [];
  result: AiProviderExecutionResult = Object.freeze({
    executionId: "execution", content: "Reply", finishReason: "STOP",
    providerConfigurationId: "provider", modelProfileId: "profile", credentialReferenceId: "credential",
    adapterKey: "fake", providerModelIdentifier: "fake", startedAt: "2026-09-02T10:00:00.000Z",
    finishedAt: "2026-09-02T10:00:00.000Z", durationMs: 0, attempts: Object.freeze([]),
  });
  failure?: Error;

  async execute(input: Parameters<ConversationAiGateway["execute"]>[0]): Promise<AiProviderExecutionResult> {
    this.requests.push(input);
    if (this.failure) throw this.failure;
    return this.result;
  }
}
