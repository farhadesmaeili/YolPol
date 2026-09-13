import {describe, expect, it, vi} from "vitest";

import {createStructuredLogger, parseLogLevel, redactLogFields} from "@/shared/infrastructure/observability/structured-logger";

function destination() {
  return {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()};
}

describe("structured logger", () => {
  it("emits deterministic JSON lines and applies the configured level", () => {
    const output = destination();
    const logger = createStructuredLogger({
      service: "health",
      environment: {NODE_ENV: "production", YOLPOL_LOG_LEVEL: "warn"},
      destination: output,
      now: () => new Date("2026-09-11T12:00:00.000Z"),
    });

    logger.info("health.ready", {requestId: "request-1"});
    logger.warn("health.unavailable", {requestId: "request-1", durationMs: 12});

    expect(output.info).not.toHaveBeenCalled();
    expect(JSON.parse(output.warn.mock.calls[0]![0])).toEqual({
      timestamp: "2026-09-11T12:00:00.000Z",
      level: "warn",
      event: "health.unavailable",
      service: "health",
      requestId: "request-1",
      durationMs: 12,
    });
  });

  it("redacts secrets, credentials, headers, and customer or commercial content recursively", () => {
    const fields = redactLogFields({
      databaseUrl: "postgresql://user:password@example.test/yolpol",
      nested: {
        authorization: "Bearer secret",
        cookie: "session=value",
        apiKey: "provider-key",
        token: "customer-token",
        body: "Customer message",
        email: "customer@example.test",
        phone: "+98123456789",
        internalPrice: 42,
        margin: 0.2,
        credentialReferenceId: "opaque-reference",
      },
    });

    expect(fields).toMatchObject({
      databaseUrl: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        cookie: "[REDACTED]",
        apiKey: "[REDACTED]",
        token: "[REDACTED]",
        body: "[REDACTED]",
        email: "[REDACTED]",
        phone: "[REDACTED]",
        internalPrice: "[REDACTED]",
        margin: "[REDACTED]",
        credentialReferenceId: "opaque-reference",
      },
    });
    expect(JSON.stringify(fields)).not.toContain("provider-key");
    expect(JSON.stringify(fields)).not.toContain("Customer message");
  });

  it("normalizes errors without arbitrary messages in Production", () => {
    const error = Object.assign(new Error("postgresql://user:password@example.test/yolpol"), {code: "ECONNREFUSED"});
    const fields = redactLogFields({error});
    expect(fields).toEqual({error: {name: "Error", code: "ECONNREFUSED"}});
    expect(JSON.stringify(fields)).not.toContain("password");
  });

  it("validates log levels and defaults to info", () => {
    expect(parseLogLevel(undefined)).toBe("info");
    expect(parseLogLevel(" DEBUG ")).toBe("debug");
    expect(() => parseLogLevel("trace")).toThrow(/YOLPOL_LOG_LEVEL/u);
  });
});
