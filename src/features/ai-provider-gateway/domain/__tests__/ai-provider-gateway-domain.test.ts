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
  it.each(["TEXT_GENERATION", "TRANSLATION"] as const)("keeps %s requests free of tool requirements", (capability) => {
    const result = parseAiProviderExecutionRequest({executionId: "regression", capability, messages: [{role: "USER", content: "Hello"}]});
    expect(result.requiredCapabilities).toEqual([capability]);
    expect(result.tools).toBeUndefined();
    expect(result.toolChoice).toBeUndefined();
  });

  it.each([
    [{role: "TOOL", name: "search_products", toolCallId: "orphan", content: "{}"}],
    [{role: "ASSISTANT", content: "", toolCalls: [{id: "call_1", name: "search_products", arguments: "{}"}]}],
    [{role: "ASSISTANT", content: "", toolCalls: [{id: "call_1", name: "search_products", arguments: "{}"}]}, {role: "TOOL", name: "wrong", toolCallId: "call_1", content: "{}"}],
  ].map((messages) => ({messages})))("rejects orphan, incomplete or mismatched tool conversations %#", ({messages}) => {
    expect(() => parseAiProviderExecutionRequest({executionId: "bad_tools", capability: "TOOL_CALLING", tools: [{name: "search_products", description: "Search", inputSchema: {type: "object", additionalProperties: false}}], messages})).toThrowError(expect.objectContaining({category: "INVALID_REQUEST"}));
  });

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
    expect(request.requiredCapabilities).toEqual(["TEXT_GENERATION"]);
  });

  it("parses strict provider-neutral tool definitions, calls, and results with an explicit capability set", () => {
    const request = parseAiProviderExecutionRequest({
      executionId: "agent_01", capability: "TOOL_CALLING", requiredCapabilities: ["TOOL_CALLING", "TEXT_GENERATION"],
      systemInstruction: "Use tools safely.",
      tools: [{name: "search_products", description: "Search public products.", inputSchema: {type: "object", properties: {query: {type: "string"}}, additionalProperties: false}}],
      messages: [
        {role: "USER", content: "Find a bottle"},
        {role: "ASSISTANT", content: "", toolCalls: [{id: "call_1", name: "search_products", arguments: '{"query":"bottle"}'}]},
        {role: "TOOL", toolCallId: "call_1", name: "search_products", content: '{"products":[]}'},
      ],
    });
    expect(request.requiredCapabilities).toEqual(["TOOL_CALLING", "TEXT_GENERATION"]);
    expect(request.tools?.[0]?.name).toBe("search_products");
    expect(request.messages[1]).toMatchObject({role: "ASSISTANT", toolCalls: [{id: "call_1"}]});
  });

  it.each([
    {executionId: "bad id", capability: "TEXT_GENERATION", messages: [{role: "USER", content: "Hello"}]},
    {executionId: "ok", capability: "UNKNOWN", messages: [{role: "USER", content: "Hello"}]},
    {executionId: "ok", capability: "STRUCTURED_OUTPUT", messages: [{role: "USER", content: "Hello"}]},
    {executionId: "ok", capability: "TOOL_CALLING", messages: [{role: "USER", content: "Hello"}]},
    {executionId: "ok", capability: "TOOL_CALLING", requiredCapabilities: ["TOOL_CALLING", "TOOL_CALLING"], tools: [{name: "x", description: "x", inputSchema: {type: "object", additionalProperties: false}}], messages: [{role: "USER", content: "Hello"}]},
    {executionId: "ok", capability: "TEXT_GENERATION", tools: [{name: "x", description: "x", inputSchema: {type: "object", additionalProperties: false}}], messages: [{role: "USER", content: "Hello"}]},
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
