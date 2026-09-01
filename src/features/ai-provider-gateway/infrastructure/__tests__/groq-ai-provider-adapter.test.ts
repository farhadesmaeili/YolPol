import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "groq-sdk";
import {describe, expect, it, vi} from "vitest";

import type {AiProviderAdapterExecution, AiProviderExecutionCandidate} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";
import {AiProviderFailure} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";
import {GroqAiProviderAdapter, type GroqChatCompletionClient, type GroqClientFactory} from "@/features/ai-provider-gateway/infrastructure/adapters/groq/groq-ai-provider-adapter";

const candidate: AiProviderExecutionCandidate = Object.freeze({
  providerConfigurationId: "provider-a",
  modelProfileId: "profile-a",
  adapterKey: "groq",
  providerModelIdentifier: "configured/model-a",
  generationSettings: Object.freeze({temperature: 0.2, topP: 0.7, maxOutputTokens: 1_024}),
  credentialReferences: Object.freeze([{id: "credential-a", credentialReference: "secret://ai/groq/primary"}]),
});

const execution: AiProviderAdapterExecution = Object.freeze({
  request: Object.freeze({
    executionId: "execution-a",
    capability: "TEXT_GENERATION",
    systemInstruction: "System instruction",
    messages: Object.freeze([{role: "USER" as const, content: "Customer content"}, {role: "ASSISTANT" as const, content: "Prior answer"}]),
    generationSettings: Object.freeze({temperature: 0.4, topP: 0.8, maxOutputTokens: 512}),
    timeoutMs: 4_000,
  }),
  candidate,
  credentialReference: "secret://ai/groq/primary",
});

function adapterReturning(value: unknown) {
  const create = vi.fn<GroqChatCompletionClient["create"]>(async () => value);
  const factory = vi.fn<GroqClientFactory>(() => ({create}));
  return {adapter: new GroqAiProviderAdapter({resolve: async () => "unit-test-secret"}, factory), create, factory};
}

function adapterThrowing(error: unknown) {
  const create = vi.fn<GroqChatCompletionClient["create"]>(async () => { throw error; });
  const factory = vi.fn<GroqClientFactory>(() => ({create}));
  return new GroqAiProviderAdapter({resolve: async () => "unit-test-secret"}, factory);
}

describe("GroqAiProviderAdapter", () => {
  it("maps the neutral request, configured model, settings, response, usage, request ID, timeout, and safety controls", async () => {
    const {adapter, create, factory} = adapterReturning({
      choices: [{finish_reason: "stop", message: {content: "Provider answer"}}],
      usage: {prompt_tokens: 11, completion_tokens: 7, total_tokens: 18},
      x_groq: {id: "groq-request-1"},
    });
    await expect(adapter.execute(execution)).resolves.toEqual({
      content: "Provider answer",
      finishReason: "STOP",
      providerRequestId: "groq-request-1",
      tokenUsage: {inputTokens: 11, outputTokens: 7, totalTokens: 18},
    });
    expect(factory).toHaveBeenCalledWith({apiKey: "unit-test-secret", maxRetries: 0, timeout: 4_000, logLevel: "off"});
    expect(factory.mock.calls[0]?.[0]).not.toHaveProperty("dangerouslyAllowBrowser");
    expect(create).toHaveBeenCalledWith({
      model: "configured/model-a",
      messages: [
        {role: "system", content: "System instruction"},
        {role: "user", content: "Customer content"},
        {role: "assistant", content: "Prior answer"},
      ],
      stream: false,
      max_completion_tokens: 512,
      temperature: 0.4,
      top_p: 0.8,
    }, {maxRetries: 0, timeout: 4_000});
  });

  it("only sends optional settings that are defined and never exceeds the profile token limit", async () => {
    const {adapter, create} = adapterReturning({choices: [{finish_reason: "length", message: {content: "answer"}}]});
    const sparseCandidate = {...candidate, generationSettings: {temperature: null, topP: null, maxOutputTokens: 256}};
    await adapter.execute({...execution, candidate: sparseCandidate, request: {...execution.request, systemInstruction: undefined, generationSettings: {maxOutputTokens: 999}}});
    const body = create.mock.calls[0]?.[0];
    expect(body).toMatchObject({model: "configured/model-a", max_completion_tokens: 256});
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
  });

  it.each([
    [new APIConnectionTimeoutError(), "TIMEOUT"],
    [new APIConnectionError({message: "network", cause: new Error("network")}), "NETWORK"],
    [new APIUserAbortError(), "CANCELLED"],
    [new AuthenticationError(401, {}, "auth", new Headers()), "AUTHENTICATION"],
    [new PermissionDeniedError(403, {}, "permission", new Headers()), "PERMISSION"],
    [new NotFoundError(404, {}, "model", new Headers()), "MODEL_NOT_FOUND_OR_CONFIG"],
    [new BadRequestError(400, {}, "bad input", new Headers()), "INVALID_REQUEST"],
    [new APIError(503, {}, "unavailable", new Headers()), "PROVIDER_UNAVAILABLE"],
    [new APIError(500, {}, "server", new Headers()), "PROVIDER_SERVER_ERROR"],
    [new Error("unknown provider detail"), "UNKNOWN_PROVIDER_ERROR"],
  ])("maps SDK failure %# to %s", async (error, category) => {
    await expect(adapterThrowing(error).execute(execution)).rejects.toMatchObject({category});
  });

  it("maps rate-limit retry metadata without leaking headers", async () => {
    const headers = new Headers({"retry-after": "1.5", "x-request-id": "request-safe", authorization: "must-not-escape"});
    const failure = await adapterThrowing(new RateLimitError(429, {}, "limited", headers)).execute(execution).catch((error: unknown) => error);
    expect(failure).toMatchObject({category: "RATE_LIMIT", retryAfterMs: 1_500, providerRequestId: "request-safe"});
    expect(JSON.stringify(failure)).not.toContain("must-not-escape");
  });

  it("rejects malformed responses and preserves a typed safety rejection from a reliable transport mapping", async () => {
    await expect(adapterReturning({choices: []}).adapter.execute(execution)).rejects.toMatchObject({category: "MALFORMED_RESPONSE"});
    await expect(adapterThrowing(new AiProviderFailure("SAFETY_REJECTION")).execute(execution)).rejects.toMatchObject({category: "SAFETY_REJECTION"});
  });

  it("maps missing secret without creating a client", async () => {
    const factory = vi.fn<GroqClientFactory>(() => ({create: vi.fn<GroqChatCompletionClient["create"]>()}));
    const adapter = new GroqAiProviderAdapter({resolve: async () => { throw new AiProviderFailure("MISSING_SECRET"); }}, factory);
    await expect(adapter.execute(execution)).rejects.toMatchObject({category: "MISSING_SECRET"});
    expect(factory).not.toHaveBeenCalled();
  });
});
