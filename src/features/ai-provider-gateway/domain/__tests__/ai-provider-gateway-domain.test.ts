import {describe, expect, it} from "vitest";

import {parseAiProviderExecutionRequest} from "@/features/ai-provider-gateway/application/use-cases/parse-ai-provider-execution-request";
import {AiProviderFailure} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";
import {
  calculateAiProviderRetryDelayMs,
  isRetryableAiProviderFailure,
  isTerminalAiProviderFailure,
  qualifiesForAiProviderCircuit,
  shouldMoveToNextCandidate,
} from "@/features/ai-provider-gateway/domain/services/ai-provider-failure-policy";

describe("AI provider gateway domain", () => {
  it("parses a bounded provider-neutral request without changing content", () => {
    const request = parseAiProviderExecutionRequest({
      executionId: "execution_01",
      capability: "TEXT_GENERATION",
      systemInstruction: "Be concise.",
      messages: [{role: "USER", content: " Hello "}, {role: "ASSISTANT", content: "Hi"}],
      generationSettings: {temperature: 0.3, topP: 0.8, maxOutputTokens: 512},
      timeoutMs: 5_000,
    });
    expect(request).toMatchObject({executionId: "execution_01", capability: "TEXT_GENERATION", timeoutMs: 5_000});
    expect(request.messages[0]?.content).toBe(" Hello ");
  });

  it.each([
    {executionId: "bad id", capability: "TEXT_GENERATION", messages: [{role: "USER", content: "Hello"}]},
    {executionId: "ok", capability: "UNKNOWN", messages: [{role: "USER", content: "Hello"}]},
    {executionId: "ok", capability: "STRUCTURED_OUTPUT", messages: [{role: "USER", content: "Hello"}]},
    {executionId: "ok", capability: "TOOL_CALLING", messages: [{role: "USER", content: "Hello"}]},
    {executionId: "ok", capability: "TEXT_GENERATION", messages: []},
    {executionId: "ok", capability: "TEXT_GENERATION", messages: [{role: "TOOL", content: "Hello"}]},
    {executionId: "ok", capability: "TEXT_GENERATION", messages: [{role: "USER", content: " "}]},
    {executionId: "ok", capability: "TEXT_GENERATION", messages: [{role: "USER", content: "Hello"}], timeoutMs: 0},
    {executionId: "ok", capability: "TEXT_GENERATION", messages: [{role: "USER", content: "Hello"}], generationSettings: {topP: 2}},
  ])("rejects invalid boundary input", (input) => {
    expect(() => parseAiProviderExecutionRequest(input)).toThrowError(expect.objectContaining({category: "INVALID_REQUEST"}));
  });

  it("keeps safety, caller, and unclassified provider errors terminal and out of circuit health", () => {
    for (const category of ["INVALID_REQUEST", "SAFETY_REJECTION", "UNKNOWN_PROVIDER_ERROR"] as const) {
      expect(isTerminalAiProviderFailure(category)).toBe(true);
      expect(isRetryableAiProviderFailure(category)).toBe(false);
      expect(qualifiesForAiProviderCircuit(category)).toBe(false);
    }
  });

  it("bounds retry delays and separates candidate and circuit policy", () => {
    expect(calculateAiProviderRetryDelayMs(0)).toBe(100);
    expect(calculateAiProviderRetryDelayMs(8, 60_000)).toBe(2_000);
    expect(shouldMoveToNextCandidate("RATE_LIMIT")).toBe(true);
    expect(qualifiesForAiProviderCircuit("RATE_LIMIT")).toBe(false);
    expect(qualifiesForAiProviderCircuit("TIMEOUT")).toBe(true);
    expect(new AiProviderFailure("MISSING_SECRET").message).not.toContain("secret://");
  });
});
