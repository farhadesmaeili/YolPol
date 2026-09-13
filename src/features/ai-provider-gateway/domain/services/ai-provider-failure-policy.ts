import type {AiProviderFailureCategory} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

const terminal = new Set<AiProviderFailureCategory>(["INVALID_REQUEST", "SAFETY_REJECTION", "CANCELLED", "UNKNOWN_PROVIDER_ERROR"]);
const retryable = new Set<AiProviderFailureCategory>(["RATE_LIMIT", "TIMEOUT", "NETWORK", "PROVIDER_UNAVAILABLE", "PROVIDER_SERVER_ERROR"]);
const circuitQualifying = new Set<AiProviderFailureCategory>(["TIMEOUT", "NETWORK", "PROVIDER_UNAVAILABLE", "PROVIDER_SERVER_ERROR"]);
const nextCandidate = new Set<AiProviderFailureCategory>(["MODEL_NOT_FOUND_OR_CONFIG", "MALFORMED_RESPONSE", "UNSUPPORTED_ADAPTER", "RATE_LIMIT"]);

export function isTerminalAiProviderFailure(category: AiProviderFailureCategory): boolean {
  return terminal.has(category);
}

export function isRetryableAiProviderFailure(category: AiProviderFailureCategory): boolean {
  return retryable.has(category);
}

export function qualifiesForAiProviderCircuit(category: AiProviderFailureCategory): boolean {
  return circuitQualifying.has(category);
}

export function shouldMoveToNextCandidate(category: AiProviderFailureCategory): boolean {
  return nextCandidate.has(category);
}

export function calculateAiProviderRetryDelayMs(retryIndex: number, retryAfterMs?: number): number {
  const exponential = Math.min(1_000, 100 * (2 ** retryIndex));
  if (retryAfterMs === undefined || !Number.isFinite(retryAfterMs) || retryAfterMs < 0) return exponential;
  return Math.min(2_000, Math.max(exponential, Math.floor(retryAfterMs)));
}
