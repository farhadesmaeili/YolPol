import {describe, expect, it} from "vitest";

import type {AiProviderExecutionResult} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";
import {presentAiProviderExecutionMetadata} from "@/features/ai-provider-gateway/presentation/presenters/ai-provider-execution-metadata-presenter";

describe("AI provider execution metadata presenter", () => {
  it("projects safe operational metadata without generated content", () => {
    const result: AiProviderExecutionResult = Object.freeze({
      executionId: "execution-a",
      content: "generated-customer-content-must-not-be-presented",
      finishReason: "STOP",
      providerConfigurationId: "provider-a",
      modelProfileId: "profile-a",
      credentialReferenceId: "credential-a",
      adapterKey: "groq",
      providerModelIdentifier: "configured/model",
      providerRequestId: "request-a",
      tokenUsage: {inputTokens: 10, outputTokens: 5, totalTokens: 15},
      startedAt: "2026-09-01T00:00:00.000Z",
      finishedAt: "2026-09-01T00:00:01.000Z",
      durationMs: 1_000,
      attempts: Object.freeze([]),
    });
    const viewModel = presentAiProviderExecutionMetadata(result);
    expect(viewModel).toMatchObject({executionId: "execution-a", adapterKey: "groq", totalTokens: 15, attemptCount: 0});
    expect(JSON.stringify(viewModel)).not.toContain(result.content);
    expect(viewModel).not.toHaveProperty("content");
  });
});
