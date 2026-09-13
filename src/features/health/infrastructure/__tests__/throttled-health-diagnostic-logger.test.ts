import {describe, expect, it, vi} from "vitest";

import {ThrottledHealthDiagnosticLogger} from "@/features/health/infrastructure/observability/throttled-health-diagnostic-logger";

describe("health diagnostic logging", () => {
  it("throttles repeated failures per check without logging successful probes", () => {
    const warn = vi.fn();
    let now = 1_000;
    const logger = new ThrottledHealthDiagnosticLogger({warn}, () => now);
    const error = new Error("private database detail");

    logger.readinessFailed({check: "database", requestId: "request-1", error});
    now += 10_000;
    logger.readinessFailed({check: "database", requestId: "request-2", error});
    logger.readinessFailed({check: "application", requestId: "request-3", error});
    now += 60_000;
    logger.readinessFailed({check: "database", requestId: "request-4", error});

    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenNthCalledWith(1, "health.readiness_failed", {
      check: "database",
      requestId: "request-1",
      error,
    });
  });
});
