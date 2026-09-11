import {afterEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

vi.mock("next-intl/middleware", () => ({default: () => () => new Response()}));

import proxy, {applyRequestIdResponseHeader, applySearchIndexingPolicy, config} from "@/proxy";
import {requestIdHeader} from "@/shared/infrastructure/http/request-id";

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

  it("returns the canonical request ID and preserves a safe inbound value", () => {
    const response = proxy(new NextRequest("https://yolpol.com/api/health/live", {
      headers: {[requestIdHeader]: "request-123"},
    }));
    expect(response.headers.get(requestIdHeader)).toBe("request-123");
    expect(config.matcher).not.toContain("api|");
  });

  it("replaces an invalid inbound request ID on the response", () => {
    const response = proxy(new NextRequest("https://yolpol.com/api/health/live", {
      headers: {[requestIdHeader]: "x".repeat(65)},
    }));
    expect(response.headers.get(requestIdHeader)).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("sets a request ID without changing an existing response policy", () => {
    const response = new Response(null, {headers: {"X-Robots-Tag": "noindex"}});
    expect(applyRequestIdResponseHeader(response, "request-1")).toBe(response);
    expect(response.headers.get(requestIdHeader)).toBe("request-1");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });
});
