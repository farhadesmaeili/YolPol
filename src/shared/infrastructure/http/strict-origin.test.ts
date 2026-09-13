import {afterEach, describe, expect, it, vi} from "vitest";

import {originAllowed, strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

function request(origin: string | undefined, url = "https://internal:3000/api/example") {
  return new Request(url, {headers: origin === undefined ? {} : {Origin: origin}});
}

describe("runtime application Origin policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  function configure(deploymentEnvironment: "production" | "staging", applicationOrigin: string) {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("YOLPOL_DEPLOYMENT_ENVIRONMENT", deploymentEnvironment);
    vi.stubEnv("YOLPOL_APP_ORIGIN", applicationOrigin);
  }

  it("accepts Production and rejects Staging when Production is running", () => {
    configure("production", "https://yolpol.com");
    expect(strictOriginAllowed(request("https://yolpol.com"))).toBe(true);
    expect(strictOriginAllowed(request("https://staging.yolpol.com"))).toBe(false);
  });

  it("accepts Staging and rejects Production or unrelated origins when Staging is running", () => {
    configure("staging", "https://staging.yolpol.com");
    expect(strictOriginAllowed(request("https://staging.yolpol.com"))).toBe(true);
    expect(strictOriginAllowed(request("https://yolpol.com"))).toBe(false);
    expect(strictOriginAllowed(request("https://attacker.example"))).toBe(false);
  });

  it("fails closed for missing or malformed runtime configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("YOLPOL_DEPLOYMENT_ENVIRONMENT", "staging");
    vi.stubEnv("YOLPOL_APP_ORIGIN", "not an origin");
    expect(strictOriginAllowed(request("https://staging.yolpol.com"))).toBe(false);

    vi.stubEnv("YOLPOL_APP_ORIGIN", "");
    expect(strictOriginAllowed(request("https://staging.yolpol.com"))).toBe(false);
  });

  it("preserves non-strict missing-Origin behavior while strict mutations reject it", () => {
    configure("production", "https://yolpol.com");
    expect(originAllowed(request(undefined))).toBe(true);
    expect(strictOriginAllowed(request(undefined))).toBe(false);
  });
});
