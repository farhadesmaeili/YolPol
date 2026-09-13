import {FixedWindowRateLimiter, type FixedWindowRateLimitConfig} from "@/shared/infrastructure/http/fixed-window-rate-limiter";

export function parseAiOperationsRateLimitConfig(environment: Readonly<Record<string, string | undefined>> = process.env): FixedWindowRateLimitConfig {
  const maxRequests = environment.STAFF_AI_OPERATIONS_RATE_LIMIT_MAX_REQUESTS === undefined
    ? 30
    : Number(environment.STAFF_AI_OPERATIONS_RATE_LIMIT_MAX_REQUESTS);
  const windowSeconds = environment.STAFF_AI_OPERATIONS_RATE_LIMIT_WINDOW_SECONDS === undefined
    ? 60
    : Number(environment.STAFF_AI_OPERATIONS_RATE_LIMIT_WINDOW_SECONDS);
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 1_000) {
    throw new Error("STAFF_AI_OPERATIONS_RATE_LIMIT_MAX_REQUESTS must be an integer from 1 to 1000.");
  }
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 3_600) {
    throw new Error("STAFF_AI_OPERATIONS_RATE_LIMIT_WINDOW_SECONDS must be an integer from 1 to 3600.");
  }
  return Object.freeze({maxRequests, windowMs: windowSeconds * 1_000});
}

export class AiOperationsRateLimiter extends FixedWindowRateLimiter {}
