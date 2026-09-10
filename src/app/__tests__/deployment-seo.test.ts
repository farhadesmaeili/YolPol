import {afterEach, describe, expect, it, vi} from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {searchEngineResponseDirective} from "@/shared/config/deployment-environment";

describe("deployment-aware search indexing", () => {
  afterEach(() => vi.unstubAllEnvs());

  function configure(deploymentEnvironment: "production" | "staging", applicationOrigin: string) {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("YOLPOL_DEPLOYMENT_ENVIRONMENT", deploymentEnvironment);
    vi.stubEnv("YOLPOL_APP_ORIGIN", applicationOrigin);
  }

  it("keeps Production crawlable and advertises the canonical sitemap", async () => {
    configure("production", "https://yolpol.com");
    expect(searchEngineResponseDirective()).toBeUndefined();
    expect(robots()).toEqual({
      rules: {userAgent: "*", allow: "/"},
      sitemap: "https://yolpol.com/sitemap.xml",
    });
    expect(await sitemap()).not.toHaveLength(0);
  });

  it("blocks Staging indexing and suppresses sitemap entries", async () => {
    configure("staging", "https://staging.yolpol.com");
    expect(searchEngineResponseDirective()).toBe("noindex, nofollow, noarchive");
    expect(robots()).toEqual({rules: {userAgent: "*", disallow: "/"}});
    expect(await sitemap()).toEqual([]);
  });
});
