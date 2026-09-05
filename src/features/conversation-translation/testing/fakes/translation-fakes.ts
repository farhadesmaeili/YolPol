import {vi} from "vitest";
import type {TranslationJobRepository} from "@/features/conversation-translation/application/ports/translation-ports";
import type {AiProviderExecutionResult} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";
import type {TranslationJob} from "@/features/conversation-translation/domain/types/translation";

export const translationJob: TranslationJob = {id: "translation_message_tr", messageId: "message", sourceLocale: "fa", targetLocale: "tr", executionId: "tx_test", leaseToken: "lease"};
export function translationJobs(source = "Hello") {
  const jobs: TranslationJobRepository = {
    claim: vi.fn().mockResolvedValueOnce(translationJob).mockResolvedValue(null),
    withExecutionLock: vi.fn(async (_job, _now, work) => { await work(source, 45_000); return true; }),
    finish: vi.fn().mockResolvedValue(true),
  };
  return jobs;
}
export function translationResponse(content = "Merhaba"): AiProviderExecutionResult {
  return {executionId: "tx_test", content, finishReason: "STOP", providerConfigurationId: "fake", modelProfileId: "fake", credentialReferenceId: "fake",
    adapterKey: "fake", providerModelIdentifier: "fake", startedAt: "2026-09-05T00:00:00.000Z", finishedAt: "2026-09-05T00:00:00.000Z", durationMs: 0, attempts: []};
}
