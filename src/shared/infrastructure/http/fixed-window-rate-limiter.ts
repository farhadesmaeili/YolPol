export type FixedWindowRateLimitDecision = Readonly<{allowed: true}> | Readonly<{allowed: false; retryAfterSeconds: number}>;
export type FixedWindowRateLimitConfig = Readonly<{maxRequests: number; windowMs: number}>;

/** Constant-memory, single-process global fixed-window limiter. */
export class FixedWindowRateLimiter {
  private windowStartedAt: number | undefined;
  private requests = 0;

  constructor(private readonly config: FixedWindowRateLimitConfig, private readonly now: () => number = Date.now) {}

  consume(): FixedWindowRateLimitDecision {
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

  get storedEntryCount(): number { return this.windowStartedAt === undefined ? 0 : 1; }
}

