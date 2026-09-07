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
  it("preserves multiple provider-neutral tool identities and rejects tool requests from text-only execution", async () => {
    const calls = ["search_products", "get_pickup_process"].map((name, index) => ({id: `call_${index}`, type: "function", function: {name, arguments: "{}"}}));
    const {adapter} = adapterReturning({choices: [{finish_reason: "tool_calls", message: {content: null, tool_calls: calls}}], internal_provider_payload: "must-not-escape"});
    await expect(adapter.execute(execution)).rejects.toMatchObject({category: "MALFORMED_RESPONSE"});
    const result = await adapter.execute({...execution, request: {...execution.request, capability: "TOOL_CALLING", tools: calls.map(({function: fn}) => ({name: fn.name, description: "Safe tool", inputSchema: {type: "object", additionalProperties: false}}))}});
    expect(result.toolCalls).toEqual(calls.map(({id, function: fn}) => ({id, name: fn.name, arguments: fn.arguments})));
    expect(JSON.stringify(result)).not.toContain("must-not-escape");
  });

  it.each([null, []])("preserves ordinary text responses with empty optional tool_calls (%j)", async (toolCalls) => {
    await expect(adapterReturning({choices: [{finish_reason: "stop", message: {content: "Answer", tool_calls: toolCalls}}]}).adapter.execute(execution))
      .resolves.toEqual({content: "Answer", finishReason: "STOP"});
  });

  it.each([
    {finish_reason: "stop", calls: [{id: "call_1", type: "function", function: {name: "search_products", arguments: "{}"}}]},
    {finish_reason: "tool_calls", calls: undefined},
    {finish_reason: "tool_calls", calls: [{id: "call_1", type: "function", function: {name: "search_products", arguments: "{}"}}, {id: "call_1", type: "function", function: {name: "get_pickup_process", arguments: "{}"}}]},
  ])("rejects inconsistent or uncorrelatable provider tool output %#", async ({finish_reason, calls}) => {
    await expect(adapterReturning({choices: [{finish_reason, message: {content: "Answer", tool_calls: calls}}]}).adapter.execute({...execution, request: {...execution.request, capability: "TOOL_CALLING", tools: [{name: "search_products", description: "Search", inputSchema: {type: "object", additionalProperties: false}}]}}))
      .rejects.toMatchObject({category: "MALFORMED_RESPONSE"});
  });

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

  it("maps neutral tools and tool-result messages to Groq and maps tool calls back to the neutral result", async () => {
    const {adapter, create} = adapterReturning({
      choices: [{finish_reason: "tool_calls", message: {content: null, tool_calls: [{id: "call_1", type: "function", function: {name: "search_products", arguments: '{"capacityMl":500}'}}]}}],
    });
    const toolExecution: AiProviderAdapterExecution = {
      ...execution,
      request: {
        ...execution.request,
        capability: "TOOL_CALLING",
        requiredCapabilities: ["TOOL_CALLING", "TEXT_GENERATION"],
        tools: [{name: "search_products", description: "Search public products.", inputSchema: {type: "object", properties: {capacityMl: {type: "integer"}}, additionalProperties: false}}],
        toolChoice: "AUTO",
        messages: [
          {role: "USER", content: "Find 500 ml"},
          {role: "ASSISTANT", content: "", toolCalls: [{id: "prior_1", name: "search_products", arguments: '{"capacityMl":250}'}]},
          {role: "TOOL", name: "search_products", toolCallId: "prior_1", content: '{"products":[]}'},
        ],
      },
    };
    await expect(adapter.execute(toolExecution)).resolves.toMatchObject({content: "", finishReason: "TOOL_CALL", toolCalls: [{id: "call_1", name: "search_products", arguments: '{"capacityMl":500}'}]});
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      tool_choice: "auto", parallel_tool_calls: false,
      tools: [{type: "function", function: {name: "search_products", description: "Search public products.", parameters: {type: "object", additionalProperties: false}}}],
      messages: [
        {role: "system", content: "System instruction"},
        {role: "user", content: "Find 500 ml"},
        {role: "assistant", content: null, tool_calls: [{id: "prior_1", type: "function", function: {name: "search_products", arguments: '{"capacityMl":250}'}}]},
        {role: "tool", content: '{"products":[]}', tool_call_id: "prior_1"},
      ],
    });
  });

  it("normalizes absent content for a valid Groq tool call without exposing provider reasoning", async () => {
    const {adapter} = adapterReturning({
      choices: [{
        finish_reason: "tool_calls",
        message: {
          reasoning: "provider private reasoning",
          tool_calls: [{
            id: "call_valid_123",
            type: "function",
            function: {name: "search_products", arguments: '{"capacityMl":500}'},
          }],
        },
      }],
    });

    const result = await adapter.execute({
      ...execution,
      request: {
        ...execution.request,
        capability: "TOOL_CALLING",
        tools: [{
          name: "search_products",
          description: "Search public products.",
          inputSchema: {type: "object", properties: {capacityMl: {type: "integer"}}, additionalProperties: false},
        }],
      },
    });

    expect(result).toEqual({
      content: "",
      finishReason: "TOOL_CALL",
      toolCalls: [{id: "call_valid_123", name: "search_products", arguments: '{"capacityMl":500}'}],
    });
    expect(JSON.stringify(result)).not.toContain("reasoning");
    expect(JSON.stringify(result)).not.toContain("provider private reasoning");
  });

  it.each([
    {description: "absent", message: {}},
    {description: "null", message: {content: null}},
    {description: "empty", message: {content: ""}},
    {description: "whitespace-only", message: {content: " \t\n"}},
  ])("rejects $description content for an ordinary text response", async ({message}) => {
    await expect(adapterReturning({choices: [{finish_reason: "stop", message}]}).adapter.execute(execution))
      .rejects.toMatchObject({category: "MALFORMED_RESPONSE"});
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

  it("classifies Groq tool-call generation failures without retaining failed generation content", async () => {
    const failure = await adapterThrowing(new BadRequestError(400, {
      error: {
        message: "Failed to call a function.",
        type: "invalid_request_error",
        code: "tool_use_failed",
        failed_generation: "private malformed provider generation",
      },
    }, "bad input", new Headers({"x-request-id": "request-safe"}))).execute(execution).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      category: "INVALID_REQUEST",
      reason: "TOOL_CALL_GENERATION_FAILED",
      providerRequestId: "request-safe",
    });
    expect(JSON.stringify(failure)).not.toContain("private malformed provider generation");
    expect(String(failure)).not.toContain("private malformed provider generation");
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("error");
  });

  it.each([
    {},
    {message: "tool_use_failed failed_generation"},
    {code: "invalid_request", failed_generation: "private generation"},
    {code: "tool_use_failed"},
    ...[undefined, null, 123, true, {}, [], "", " \t\n"].map((failed_generation) => ({code: "tool_use_failed", failed_generation})),
  ])("does not classify an incomplete or malformed tool-generation error %# for recovery", async (detail) => {
    const failure = await adapterThrowing(new BadRequestError(400, {error: detail}, undefined, new Headers()))
      .execute(execution).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AiProviderFailure);
    expect(failure).toMatchObject({category: "INVALID_REQUEST", reason: undefined});
  });

  it("does not fall back to outer markers when the error envelope is malformed", async () => {
    const failure = await adapterThrowing(new BadRequestError(400, {
      error: [], code: "tool_use_failed", failed_generation: "private generation",
    }, undefined, new Headers())).execute(execution).catch((error: unknown) => error);
    expect(failure).toMatchObject({category: "INVALID_REQUEST", reason: undefined});
  });

  it("maps NONE and rejects a provider tool call despite tools being defined", async () => {
    const {adapter, create} = adapterReturning({choices: [{finish_reason: "tool_calls", message: {
      content: null, tool_calls: [{id: "call_1", type: "function", function: {name: "search_products", arguments: "{}"}}],
    }}]});
    await expect(adapter.execute({...execution, request: {...execution.request, capability: "TOOL_CALLING",
      tools: [{name: "search_products", description: "Search", inputSchema: {type: "object", additionalProperties: false}}],
      toolChoice: "NONE",
    }})).rejects.toMatchObject({category: "MALFORMED_RESPONSE"});
    expect(create.mock.calls[0]?.[0]).toMatchObject({tool_choice: "none", parallel_tool_calls: false});
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
