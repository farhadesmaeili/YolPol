export type InquiryRateLimitDecision = Readonly<{allowed: true}> | Readonly<{allowed: false; retryAfterSeconds: number}>;

export type InquiryRateLimitConfig = Readonly<{maxRequests: number; windowMs: number}>;

export function parseInquiryRateLimitConfig(environment: Readonly<Record<string, string | undefined>> = process.env): InquiryRateLimitConfig {
  const maxRequests = environment.INQUIRY_RATE_LIMIT_MAX_REQUESTS === undefined ? 60 : Number(environment.INQUIRY_RATE_LIMIT_MAX_REQUESTS);
  const windowSeconds = environment.INQUIRY_RATE_LIMIT_WINDOW_SECONDS === undefined ? 600 : Number(environment.INQUIRY_RATE_LIMIT_WINDOW_SECONDS);
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 10_000) throw new Error("INQUIRY_RATE_LIMIT_MAX_REQUESTS must be an integer from 1 to 10000.");
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) throw new Error("INQUIRY_RATE_LIMIT_WINDOW_SECONDS must be an integer from 1 to 86400.");
  return Object.freeze({maxRequests, windowMs: windowSeconds * 1_000});
}

/** Constant-memory, single-process global fixed-window limiter. */
export class InquiryRateLimiter {
  private windowStartedAt: number | undefined;
  private requests = 0;

  constructor(private readonly config: InquiryRateLimitConfig, private readonly now: () => number = Date.now) {}

  consume(): InquiryRateLimitDecision {
    const current = this.now();
    if (this.windowStartedAt === undefined || current - this.windowStartedAt >= this.config.windowMs || current < this.windowStartedAt) {
      this.windowStartedAt = current;
      this.requests = 0;
    }
    if (this.requests >= this.config.maxRequests) {
      return {allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((this.windowStartedAt + this.config.windowMs - current) / 1_000))};
    }
    this.requests += 1;
    return {allowed: true};
  }

  /** The limiter never stores client-keyed entries. */
  get storedEntryCount(): number { return this.windowStartedAt === undefined ? 0 : 1; }
}
