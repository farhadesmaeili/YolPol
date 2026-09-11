import {describe, expect, it} from "vitest";

import {
  EnvironmentApplicationReadinessProbe,
  readBuildIdentity,
} from "@/features/health/infrastructure/config/environment-application-readiness-probe";

describe("health application configuration", () => {
  it.each([
    ["staging", "https://staging.yolpol.com"],
    ["production", "https://yolpol.com"],
  ] as const)("supports the %s deployment contract", (deploymentEnvironment, origin) => {
    const probe = new EnvironmentApplicationReadinessProbe({
      NODE_ENV: "production",
      YOLPOL_DEPLOYMENT_ENVIRONMENT: deploymentEnvironment,
      YOLPOL_APP_ORIGIN: origin,
      YOLPOL_LOG_LEVEL: "info",
      YOLPOL_GIT_REVISION: "ABCDEF012345",
    });
    expect(probe.check()).toEqual({version: "0.1.0", revision: "abcdef012345"});
  });

  it("uses package metadata without requiring a revision in Development or CI", () => {
    expect(readBuildIdentity({NODE_ENV: "test"})).toEqual({version: "0.1.0"});
  });

  it("rejects unsafe revision and log-level values", () => {
    expect(() => readBuildIdentity({YOLPOL_GIT_REVISION: "feature/secret branch"})).toThrow(/YOLPOL_GIT_REVISION/u);
    expect(() => new EnvironmentApplicationReadinessProbe({NODE_ENV: "test", YOLPOL_LOG_LEVEL: "verbose"}).check())
      .toThrow(/YOLPOL_LOG_LEVEL/u);
  });
});
