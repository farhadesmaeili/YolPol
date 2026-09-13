import {describe, expect, it} from "vitest";

import {CheckReadiness} from "@/features/health/application/use-cases/check-readiness";
import {
  FakeApplicationReadinessProbe,
  FakeDatabaseReadinessProbe,
  FakeHealthDiagnosticLogger,
} from "@/features/health/testing/fakes/health-readiness-fakes";

describe("check readiness", () => {
  it("reports ready only after application and database checks succeed", async () => {
    const database = new FakeDatabaseReadinessProbe();
    const logger = new FakeHealthDiagnosticLogger();
    const result = await new CheckReadiness(
      new FakeApplicationReadinessProbe({version: "0.1.0", revision: "abcdef0"}),
      database,
      logger,
    ).execute({requestId: "request-1"});

    expect(result).toEqual({
      status: "ok",
      checks: {application: "ok", database: "ok"},
      build: {version: "0.1.0", revision: "abcdef0"},
    });
    expect(database.calls).toBe(1);
    expect(logger.failures).toEqual([]);
  });

  it("fails closed before the database when application configuration is invalid", async () => {
    const error = new Error("secret configuration detail");
    const database = new FakeDatabaseReadinessProbe();
    const logger = new FakeHealthDiagnosticLogger();
    const result = await new CheckReadiness(
      new FakeApplicationReadinessProbe({version: "0.1.0"}, error),
      database,
      logger,
    ).execute({requestId: "request-2"});

    expect(result).toEqual({
      status: "unavailable",
      checks: {application: "failed", database: "not_checked"},
    });
    expect(database.calls).toBe(0);
    expect(logger.failures).toEqual([{check: "application", requestId: "request-2", error}]);
  });

  it("reports only a safe database failure state", async () => {
    const error = new Error("postgresql://user:password@example.test/yolpol");
    const logger = new FakeHealthDiagnosticLogger();
    const result = await new CheckReadiness(
      new FakeApplicationReadinessProbe(),
      new FakeDatabaseReadinessProbe(error),
      logger,
    ).execute({requestId: null});

    expect(result).toEqual({
      status: "unavailable",
      checks: {application: "ok", database: "failed"},
      build: {version: "0.1.0"},
    });
    expect(logger.failures).toEqual([{check: "database", requestId: null, error}]);
  });
});
