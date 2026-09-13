import type {ExecuteAiProviderRequestInput} from "@/features/ai-provider-gateway/application/use-cases/parse-ai-provider-execution-request";
import type {AiProviderExecutionResult} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";
import type {ConversationAgentGateway} from "@/features/conversation-ai-agent/application/ports/conversation-agent-ports";

export function agentGatewayResult(input: Readonly<{content?: string; finishReason?: AiProviderExecutionResult["finishReason"]; toolCalls?: AiProviderExecutionResult["toolCalls"]}> = {}): AiProviderExecutionResult {
  return Object.freeze({
    executionId: "agent-test", content: input.content ?? "", finishReason: input.finishReason ?? (input.toolCalls ? "TOOL_CALL" : "STOP"),
    ...(input.toolCalls ? {toolCalls: Object.freeze([...input.toolCalls])} : {}),
    providerConfigurationId: "provider", modelProfileId: "profile", credentialReferenceId: "credential",
    adapterKey: "fake", providerModelIdentifier: "fake/model", startedAt: "2026-09-05T10:00:00.000Z",
    finishedAt: "2026-09-05T10:00:00.001Z", durationMs: 1, attempts: Object.freeze([]),
  });
}

export class FakeConversationAgentGateway implements ConversationAgentGateway {
  readonly requests: ExecuteAiProviderRequestInput[] = [];
  readonly outcomes: (AiProviderExecutionResult | Error)[] = [];
  async execute(input: ExecuteAiProviderRequestInput): Promise<AiProviderExecutionResult> {
    this.requests.push(input);
    const outcome = this.outcomes.shift();
    if (!outcome) throw new Error("Missing fake Agent Gateway outcome.");
    if (outcome instanceof Error) throw outcome;
    return outcome;
  }
}
