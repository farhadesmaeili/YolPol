import {describe, expect, it} from "vitest";

import {
  InvalidDeploymentEnvironmentConfigurationError,
  parseApplicationOrigin,
  parseDeploymentEnvironment,
  readDeploymentEnvironmentContract,
  searchEngineResponseDirective,
  searchIndexingEnabled,
} from "@/shared/config/deployment-environment";
import {siteConfig} from "@/shared/config/site";

describe("deployment environment contract", () => {
  const production = {
    NODE_ENV: "production",
    YOLPOL_DEPLOYMENT_ENVIRONMENT: "production",
    YOLPOL_APP_ORIGIN: "https://yolpol.com",
  } as const;
  const staging = {
    NODE_ENV: "production",
    YOLPOL_DEPLOYMENT_ENVIRONMENT: "staging",
    YOLPOL_APP_ORIGIN: "https://staging.yolpol.com",
  } as const;

  it("separates exact Production and Staging application origins from the canonical public identity", () => {
    expect(readDeploymentEnvironmentContract(production)).toEqual({
      deploymentEnvironment: "production",
      applicationOrigin: "https://yolpol.com",
      searchIndexingEnabled: true,
    });
    expect(readDeploymentEnvironmentContract(staging)).toEqual({
      deploymentEnvironment: "staging",
      applicationOrigin: "https://staging.yolpol.com",
      searchIndexingEnabled: false,
    });
    expect(siteConfig.url).toBe("https://yolpol.com");
  });

  it.each([
    "not a URL",
    "http://staging.yolpol.com",
    "https://user:password@staging.yolpol.com",
    "https://staging.yolpol.com/path",
    "https://staging.yolpol.com?",
    "https://staging.yolpol.com#",
  ])("rejects malformed or unsafe configured application origin %s", (origin) => {
    expect(() => parseApplicationOrigin(origin)).toThrow(InvalidDeploymentEnvironmentConfigurationError);
  });

  it.each([
    {NODE_ENV: "production", YOLPOL_DEPLOYMENT_ENVIRONMENT: "staging"},
    {NODE_ENV: "production", YOLPOL_DEPLOYMENT_ENVIRONMENT: "production"},
    {NODE_ENV: "production", YOLPOL_APP_ORIGIN: "https://yolpol.com"},
  ])("fails closed when required Production-mode configuration is missing", (environment) => {
    expect(() => readDeploymentEnvironmentContract(environment)).toThrow(InvalidDeploymentEnvironmentConfigurationError);
    expect(searchIndexingEnabled(environment)).toBe(false);
    expect(searchEngineResponseDirective(environment)).toBe("noindex, nofollow, noarchive");
  });

  it("prevents accidental Production and Staging origin inversion", () => {
    expect(() => readDeploymentEnvironmentContract({...production, YOLPOL_APP_ORIGIN: "https://staging.yolpol.com"})).toThrow(/canonical Production origin/u);
    expect(() => readDeploymentEnvironmentContract({...staging, YOLPOL_APP_ORIGIN: "https://yolpol.com"})).toThrow(/must not equal/u);
  });

  it("preserves Development configuration and its localhost fallback", () => {
    expect(readDeploymentEnvironmentContract({NODE_ENV: "development"})).toEqual({
      deploymentEnvironment: "development",
      applicationOrigin: "http://localhost:3000",
      searchIndexingEnabled: true,
    });
    expect(readDeploymentEnvironmentContract({
      NODE_ENV: "development",
      YOLPOL_DEV_ORIGIN: "http://192.168.1.100:3000/",
    })).toMatchObject({applicationOrigin: "http://192.168.1.100:3000"});
  });

  it("keeps tests isolated without Production or Staging variables", () => {
    expect(parseDeploymentEnvironment({NODE_ENV: "test"})).toBe("test");
    expect(parseDeploymentEnvironment({NODE_ENV: "test", YOLPOL_DEPLOYMENT_ENVIRONMENT: "production"})).toBe("test");
    expect(readDeploymentEnvironmentContract({NODE_ENV: "test"})).toMatchObject({
      deploymentEnvironment: "test",
      applicationOrigin: siteConfig.url,
    });
  });
});
