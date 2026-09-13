import {FixedWindowRateLimiter, type FixedWindowRateLimitConfig} from "@/shared/infrastructure/http/fixed-window-rate-limiter";

export type StaffConversationReplyRateLimitConfig = FixedWindowRateLimitConfig;

export function parseStaffConversationReplyRateLimitConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): StaffConversationReplyRateLimitConfig {
  const maxRequests = environment.STAFF_REPLY_RATE_LIMIT_MAX_REQUESTS === undefined
    ? 120
    : Number(environment.STAFF_REPLY_RATE_LIMIT_MAX_REQUESTS);
  const windowSeconds = environment.STAFF_REPLY_RATE_LIMIT_WINDOW_SECONDS === undefined
    ? 60
    : Number(environment.STAFF_REPLY_RATE_LIMIT_WINDOW_SECONDS);
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 10_000) {
    throw new Error("STAFF_REPLY_RATE_LIMIT_MAX_REQUESTS must be an integer from 1 to 10000.");
  }
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 3_600) {
    throw new Error("STAFF_REPLY_RATE_LIMIT_WINDOW_SECONDS must be an integer from 1 to 3600.");
  }
  return Object.freeze({maxRequests, windowMs: windowSeconds * 1_000});
}

export class StaffConversationReplyRateLimiter extends FixedWindowRateLimiter {}
