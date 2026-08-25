import {FixedWindowRateLimiter, type FixedWindowRateLimitConfig} from "@/shared/infrastructure/http/fixed-window-rate-limiter";

export type InquiryRateLimitDecision = ReturnType<FixedWindowRateLimiter["consume"]>;

export type InquiryRateLimitConfig = FixedWindowRateLimitConfig;

export function parseInquiryRateLimitConfig(environment: Readonly<Record<string, string | undefined>> = process.env): InquiryRateLimitConfig {
  const maxRequests = environment.INQUIRY_RATE_LIMIT_MAX_REQUESTS === undefined ? 60 : Number(environment.INQUIRY_RATE_LIMIT_MAX_REQUESTS);
  const windowSeconds = environment.INQUIRY_RATE_LIMIT_WINDOW_SECONDS === undefined ? 600 : Number(environment.INQUIRY_RATE_LIMIT_WINDOW_SECONDS);
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 10_000) throw new Error("INQUIRY_RATE_LIMIT_MAX_REQUESTS must be an integer from 1 to 10000.");
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) throw new Error("INQUIRY_RATE_LIMIT_WINDOW_SECONDS must be an integer from 1 to 86400.");
  return Object.freeze({maxRequests, windowMs: windowSeconds * 1_000});
}

export class InquiryRateLimiter extends FixedWindowRateLimiter {}
