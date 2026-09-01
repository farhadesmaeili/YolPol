import type {AiProviderExecutionAttempt, AiProviderFailureCategory} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

const safeFailureMessages: Readonly<Record<AiProviderFailureCategory, string>> = Object.freeze({
  INVALID_REQUEST: "The AI execution request is invalid.",
  SAFETY_REJECTION: "The AI provider rejected the request for safety reasons.",
  AUTHENTICATION: "AI provider authentication failed.",
  PERMISSION: "The AI provider denied the configured credential.",
  MODEL_NOT_FOUND_OR_CONFIG: "The configured AI model is unavailable.",
  RATE_LIMIT: "The AI provider rate limit was reached.",
  TIMEOUT: "The AI provider request timed out.",
  NETWORK: "The AI provider network request failed.",
  PROVIDER_UNAVAILABLE: "The AI provider is unavailable.",
  PROVIDER_SERVER_ERROR: "The AI provider returned a server error.",
  MALFORMED_RESPONSE: "The AI provider returned an invalid response.",
  UNKNOWN_PROVIDER_ERROR: "The AI provider request failed.",
  MISSING_SECRET: "The AI provider credential is unavailable.",
  UNSUPPORTED_ADAPTER: "The configured AI provider adapter is unavailable.",
  NO_ELIGIBLE_CANDIDATES: "No eligible AI provider candidate is configured.",
  CIRCUIT_OPEN: "All eligible AI provider targets are temporarily unavailable.",
  CANCELLED: "The AI provider request was cancelled.",
});

export class AiProviderFailure extends Error {
  constructor(
    readonly category: AiProviderFailureCategory,
    readonly retryAfterMs?: number,
    readonly providerRequestId?: string,
  ) {
    super(safeFailureMessages[category]);
    this.name = "AiProviderFailure";
  }
}
export class AiProviderGatewayError extends Error {
  constructor(
    readonly category: AiProviderFailureCategory,
    readonly executionId: string,
    readonly attempts: readonly AiProviderExecutionAttempt[],
  ) {
    super(safeFailureMessages[category]);
    this.name = "AiProviderGatewayError";
  }
}

export class AiRuntimeHealthPersistenceError extends Error {
  constructor() {
    super("AI provider runtime health persistence failed.");
    this.name = "AiRuntimeHealthPersistenceError";
  }
}
