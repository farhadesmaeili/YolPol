import {describe, expect, it} from "vitest";

import {CheckReadiness} from "@/features/health/application/use-cases/check-readiness";
import {createLivenessRequestHandler, createReadinessRequestHandler} from "@/features/health/presentation/adapters/health-request-handlers";
import {
  FakeApplicationReadinessProbe,
  FakeDatabaseReadinessProbe,
  FakeHealthDiagnosticLogger,
} from "@/features/health/testing/fakes/health-readiness-fakes";
import {requestIdHeader} from "@/shared/infrastructure/http/request-id";

describe("health HTTP handlers", () => {
  it("returns a cheap content-free no-store liveness response without dependencies or logs", async () => {
    const response = await createLivenessRequestHandler()();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({status: "ok"});
  });

  it("returns ready with safe build identity after a successful database probe", async () => {
    const check = new CheckReadiness(
      new FakeApplicationReadinessProbe({version: "0.1.0", revision: "abcdef0"}),
      new FakeDatabaseReadinessProbe(),
      new FakeHealthDiagnosticLogger(),
    );
    const response = await createReadinessRequestHandler(check)(new Request("https://yolpol.com/api/health/ready"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      checks: {application: "ok", database: "ok"},
      version: "0.1.0",
      revision: "abcdef0",
    });
  });

  it("returns 503 without exposing raw database errors or configuration", async () => {
    const sensitive = "postgresql://user:password@example.test/private";
    const logger = new FakeHealthDiagnosticLogger();
    const check = new CheckReadiness(
      new FakeApplicationReadinessProbe(),
      new FakeDatabaseReadinessProbe(new Error(sensitive)),
      logger,
    );
    const response = await createReadinessRequestHandler(check)(new Request("https://yolpol.com/api/health/ready", {
      headers: {[requestIdHeader]: "request-123"},
    }));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(serialized).toBe(JSON.stringify({
      status: "unavailable",
      checks: {application: "ok", database: "failed"},
      version: "0.1.0",
    }));
    expect(serialized).not.toContain(sensitive);
    expect(serialized).not.toMatch(/DATABASE_URL|host|user|password|stack/iu);
    expect(logger.failures[0]?.requestId).toBe("request-123");
  });
});
