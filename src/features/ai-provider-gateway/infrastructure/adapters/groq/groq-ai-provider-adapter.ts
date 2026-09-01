import "server-only";

import Groq, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "groq-sdk";
import type {ChatCompletionCreateParamsNonStreaming} from "groq-sdk/resources/chat/completions";

import type {
  AiCredentialSecretResolver,
  AiProviderAdapter,
  AiProviderAdapterExecution,
  AiProviderAdapterResult,
} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";
import {AiProviderFailure} from "@/features/ai-provider-gateway/domain/errors/ai-provider-gateway-errors";
import type {AiProviderFinishReason, AiProviderTokenUsage} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

export type GroqClientOptions = Readonly<{
  apiKey: string;
  maxRetries: 0;
  timeout: number;
  logLevel: "off";
}>;

export type GroqRequestOptions = Readonly<{
  maxRetries: 0;
  timeout: number;
  signal?: AbortSignal;
}>;

export interface GroqChatCompletionClient {
  create(request: ChatCompletionCreateParamsNonStreaming, options: GroqRequestOptions): Promise<unknown>;
}

export type GroqClientFactory = (options: GroqClientOptions) => GroqChatCompletionClient;

const createOfficialGroqClient: GroqClientFactory = (options) => {
  const client = new Groq(options);
  return Object.freeze({
    create: (request: ChatCompletionCreateParamsNonStreaming, requestOptions: GroqRequestOptions) => client.chat.completions.create(request, requestOptions),
  });
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapFinishReason(value: unknown): AiProviderFinishReason {
  if (value === "stop") return "STOP";
  if (value === "length") return "LENGTH";
  if (value === "tool_calls" || value === "function_call") return "TOOL_CALL";
  return "UNKNOWN";
}

function parseUsage(value: unknown): AiProviderTokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const inputTokens = value.prompt_tokens;
  const outputTokens = value.completion_tokens;
  const totalTokens = value.total_tokens;
  if (typeof inputTokens !== "number" || !Number.isSafeInteger(inputTokens) || inputTokens < 0) return undefined;
  if (typeof outputTokens !== "number" || !Number.isSafeInteger(outputTokens) || outputTokens < 0) return undefined;
  if (typeof totalTokens !== "number" || !Number.isSafeInteger(totalTokens) || totalTokens < 0) return undefined;
  return Object.freeze({inputTokens, outputTokens, totalTokens});
}

const safeProviderRequestIdPattern = /^[A-Za-z0-9._:/-]{1,256}$/;
function parseProviderRequestId(response: Readonly<Record<string, unknown>>): string | undefined {
  const metadata = response.x_groq;
  if (!isRecord(metadata) || typeof metadata.id !== "string" || !safeProviderRequestIdPattern.test(metadata.id)) return undefined;
  return metadata.id;
}

function mapResponse(value: unknown): AiProviderAdapterResult {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length === 0) throw new AiProviderFailure("MALFORMED_RESPONSE");
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") throw new AiProviderFailure("MALFORMED_RESPONSE");
  const providerRequestId = parseProviderRequestId(value);
  const tokenUsage = parseUsage(value.usage);
  return Object.freeze({
    content: choice.message.content,
    finishReason: mapFinishReason(choice.finish_reason),
    ...(providerRequestId === undefined ? {} : {providerRequestId}),
    ...(tokenUsage === undefined ? {} : {tokenUsage}),
  });
}

function retryAfterMilliseconds(error: APIError): number | undefined {
  const milliseconds = error.headers?.get("retry-after-ms");
  if (milliseconds) {
    const parsed = Number(milliseconds);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.min(2_000, Math.floor(parsed));
  }
  const seconds = error.headers?.get("retry-after");
  if (seconds) {
    const parsed = Number(seconds);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.min(2_000, Math.floor(parsed * 1_000));
  }
  return undefined;
}

function safeProviderRequestId(error: APIError): string | undefined {
  const value = error.headers?.get("x-request-id");
  return value && safeProviderRequestIdPattern.test(value) ? value : undefined;
}

function mapGroqFailure(error: unknown): AiProviderFailure {
  if (error instanceof AiProviderFailure) return error;
  if (error instanceof APIUserAbortError) return new AiProviderFailure("CANCELLED");
  if (error instanceof APIConnectionTimeoutError) return new AiProviderFailure("TIMEOUT");
  if (error instanceof APIConnectionError) return new AiProviderFailure("NETWORK");
  if (error instanceof AuthenticationError) return new AiProviderFailure("AUTHENTICATION", undefined, safeProviderRequestId(error));
  if (error instanceof PermissionDeniedError) return new AiProviderFailure("PERMISSION", undefined, safeProviderRequestId(error));
  if (error instanceof NotFoundError) return new AiProviderFailure("MODEL_NOT_FOUND_OR_CONFIG", undefined, safeProviderRequestId(error));
  if (error instanceof RateLimitError) return new AiProviderFailure("RATE_LIMIT", retryAfterMilliseconds(error), safeProviderRequestId(error));
  if (error instanceof BadRequestError || error instanceof UnprocessableEntityError) return new AiProviderFailure("INVALID_REQUEST", undefined, safeProviderRequestId(error));
  if (error instanceof APIError) {
    const requestId = safeProviderRequestId(error);
    if (error.status === 408) return new AiProviderFailure("TIMEOUT", undefined, requestId);
    if (error.status === 429) return new AiProviderFailure("RATE_LIMIT", retryAfterMilliseconds(error), requestId);
    if (error.status === 502 || error.status === 503 || error.status === 504) return new AiProviderFailure("PROVIDER_UNAVAILABLE", undefined, requestId);
    if (typeof error.status === "number" && error.status >= 500) return new AiProviderFailure("PROVIDER_SERVER_ERROR", undefined, requestId);
  }
  return new AiProviderFailure("UNKNOWN_PROVIDER_ERROR");
}

function mapMessages(input: AiProviderAdapterExecution): ChatCompletionCreateParamsNonStreaming["messages"] {
  const messages: ChatCompletionCreateParamsNonStreaming["messages"] = [];
  if (input.request.systemInstruction !== undefined) messages.push({role: "system", content: input.request.systemInstruction});
  for (const message of input.request.messages) {
    if (message.role === "SYSTEM") messages.push({role: "system", content: message.content});
    else if (message.role === "USER") messages.push({role: "user", content: message.content});
    else messages.push({role: "assistant", content: message.content});
  }
  return messages;
}

function createRequest(input: AiProviderAdapterExecution): ChatCompletionCreateParamsNonStreaming {
  const configured = input.candidate.generationSettings;
  const requested = input.request.generationSettings;
  const temperature = requested?.temperature ?? configured.temperature ?? undefined;
  const topP = requested?.topP ?? configured.topP ?? undefined;
  const maxOutputTokens = Math.min(requested?.maxOutputTokens ?? configured.maxOutputTokens, configured.maxOutputTokens);
  return {
    model: input.candidate.providerModelIdentifier,
    messages: mapMessages(input),
    stream: false,
    max_completion_tokens: maxOutputTokens,
    ...(temperature === undefined ? {} : {temperature}),
    ...(topP === undefined ? {} : {top_p: topP}),
  };
}

export class GroqAiProviderAdapter implements AiProviderAdapter {
  readonly adapterKey = "groq";

  constructor(
    private readonly secrets: AiCredentialSecretResolver,
    private readonly createClient: GroqClientFactory = createOfficialGroqClient,
  ) {}

  async execute(input: AiProviderAdapterExecution): Promise<AiProviderAdapterResult> {
    try {
      const apiKey = await this.secrets.resolve(input.credentialReference);
      const client = this.createClient({apiKey, maxRetries: 0, timeout: input.request.timeoutMs, logLevel: "off"});
      const response = await client.create(createRequest(input), {
        maxRetries: 0,
        timeout: input.request.timeoutMs,
        ...(input.signal ? {signal: input.signal} : {}),
      });
      return mapResponse(response);
    } catch (error) {
      throw mapGroqFailure(error);
    }
  }
}
