import type {AiProviderExecutionResult} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

export type AiProviderExecutionMetadataViewModel = Readonly<{
  executionId: string;
  providerConfigurationId: string;
  modelProfileId: string;
  credentialReferenceId: string;
  adapterKey: string;
  providerModelIdentifier: string;
  providerRequestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  attemptCount: number;
}>;

export function presentAiProviderExecutionMetadata(result: AiProviderExecutionResult): AiProviderExecutionMetadataViewModel {
  return Object.freeze({
    executionId: result.executionId,
    providerConfigurationId: result.providerConfigurationId,
    modelProfileId: result.modelProfileId,
    credentialReferenceId: result.credentialReferenceId,
    adapterKey: result.adapterKey,
    providerModelIdentifier: result.providerModelIdentifier,
    ...(result.providerRequestId === undefined ? {} : {providerRequestId: result.providerRequestId}),
    ...(result.tokenUsage === undefined ? {} : {
      inputTokens: result.tokenUsage.inputTokens,
      outputTokens: result.tokenUsage.outputTokens,
      totalTokens: result.tokenUsage.totalTokens,
    }),
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    attemptCount: result.attempts.length,
  });
}
