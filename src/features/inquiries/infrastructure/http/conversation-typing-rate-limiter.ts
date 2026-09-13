import {FixedWindowRateLimiter, type FixedWindowRateLimitConfig} from "@/shared/infrastructure/http/fixed-window-rate-limiter";

export type ConversationTypingRateLimitConfig = FixedWindowRateLimitConfig;

export function parseConversationTypingRateLimitConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ConversationTypingRateLimitConfig {
  const maxRequests = environment.CONVERSATION_TYPING_RATE_LIMIT_MAX_REQUESTS === undefined
    ? 120
    : Number(environment.CONVERSATION_TYPING_RATE_LIMIT_MAX_REQUESTS);
  const windowSeconds = environment.CONVERSATION_TYPING_RATE_LIMIT_WINDOW_SECONDS === undefined
    ? 60
    : Number(environment.CONVERSATION_TYPING_RATE_LIMIT_WINDOW_SECONDS);
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 10_000) {
    throw new Error("CONVERSATION_TYPING_RATE_LIMIT_MAX_REQUESTS must be an integer from 1 to 10000.");
  }
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 3_600) {
    throw new Error("CONVERSATION_TYPING_RATE_LIMIT_WINDOW_SECONDS must be an integer from 1 to 3600.");
  }
  return Object.freeze({maxRequests, windowMs: windowSeconds * 1_000});
}

/** Process-local limiter; each deployment replica maintains an independent window. */
export class ConversationTypingRateLimiter extends FixedWindowRateLimiter {}
