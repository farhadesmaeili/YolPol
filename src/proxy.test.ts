import {afterEach, describe, expect, it, vi} from "vitest";

vi.mock("next-intl/middleware", () => ({default: () => () => new Response()}));

import {applySearchIndexingPolicy} from "@/proxy";

describe("deployment indexing response policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  function responseFor(deploymentEnvironment: "production" | "staging", applicationOrigin: string) {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("YOLPOL_DEPLOYMENT_ENVIRONMENT", deploymentEnvironment);
    vi.stubEnv("YOLPOL_APP_ORIGIN", applicationOrigin);
    return applySearchIndexingPolicy(new Response());
  }

  it("adds the complete Staging X-Robots-Tag directive", () => {
    expect(responseFor("staging", "https://staging.yolpol.com").headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("does not weaken Production indexing", () => {
    expect(responseFor("production", "https://yolpol.com").headers.get("X-Robots-Tag")).toBeNull();
  });
});
