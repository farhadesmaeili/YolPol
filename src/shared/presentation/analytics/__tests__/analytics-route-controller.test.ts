import {describe, expect, it, vi} from "vitest";

import {
  activateGoogleAnalyticsForPathname,
  persistAnalyticsConsent,
  readStoredAnalyticsConsent,
  shouldRenderAnalyticsSettingsControl,
  shouldShowAnalyticsConsent,
} from "@/shared/presentation/analytics/analytics-route-controller";
import {
  GoogleAnalyticsClient,
  type GoogleAnalyticsBrowserAdapter,
  type GoogleTagCommand,
} from "@/shared/presentation/analytics/google-analytics-client";

function harness(pathname = "/en") {
  const commands: GoogleTagCommand[] = [];
  const scripts: string[] = [];
  const adapter: GoogleAnalyticsBrowserAdapter = {
    send: (command) => commands.push(command),
    ensureExternalScript: (measurementId) => scripts.push(measurementId),
    currentPathname: () => pathname,
    pageContext: (pagePathname) => ({
      page_location: `https://yolpol.com${pagePathname}`,
      page_title: "Public page",
    }),
    expireAnalyticsCookies: vi.fn(),
  };
  return {client: new GoogleAnalyticsClient(adapter), commands, scripts};
}

describe("analytics route controller", () => {
  it.each([
    "/en/staff",
    "/en/staff/login",
    "/en/staff/activate",
    "/en/staff/inquiries/private-inquiry-id",
  ])("keeps stored grant completely inert on %s", async (pathname) => {
    const {client, commands, scripts} = harness(pathname);
    const readRuntimeConfig = vi.fn().mockResolvedValue({
      enabled: true,
      measurementId: "G-76B2GKE2Q8",
    });

    expect(await activateGoogleAnalyticsForPathname({
      pathname,
      decision: "granted",
      signal: new AbortController().signal,
      client,
      readRuntimeConfig,
    })).toBe(false);
    expect(readRuntimeConfig).not.toHaveBeenCalled();
    expect(commands).toEqual([]);
    expect(scripts).toEqual([]);
    expect(shouldShowAnalyticsConsent(pathname, null, false)).toBe(false);
    expect(shouldShowAnalyticsConsent(pathname, "granted", true)).toBe(false);
    expect(shouldRenderAnalyticsSettingsControl(pathname)).toBe(false);
  });

  it("activates a stored public grant once and deduplicates Strict Mode-style replay", async () => {
    const {client, commands, scripts} = harness();
    const readRuntimeConfig = vi.fn().mockResolvedValue({
      enabled: true,
      measurementId: "G-76B2GKE2Q8",
    });
    client.defaultConsentDenied();
    const input = {
      pathname: "/en",
      decision: "granted" as const,
      signal: new AbortController().signal,
      client,
      readRuntimeConfig,
    };

    expect(await activateGoogleAnalyticsForPathname(input)).toBe(true);
    expect(await activateGoogleAnalyticsForPathname(input)).toBe(false);
    expect(await activateGoogleAnalyticsForPathname({...input, pathname: "/fa/privacy"})).toBe(true);

    expect(readRuntimeConfig).toHaveBeenCalledOnce();
    expect(scripts).toEqual(["G-76B2GKE2Q8"]);
    expect(shouldRenderAnalyticsSettingsControl("/en")).toBe(true);
    expect(commands.filter(([command]) => command === "config")).toHaveLength(1);
    expect(commands.filter((command) => command[0] === "event" && command[1] === "page_view")).toHaveLength(2);
  });

  it("fails closed when storage is unavailable and never activates without consent", async () => {
    const storage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    const {client, commands, scripts} = harness();
    const readRuntimeConfig = vi.fn();

    expect(readStoredAnalyticsConsent(storage)).toBeNull();
    expect(() => persistAnalyticsConsent(storage, "denied")).not.toThrow();
    expect(await activateGoogleAnalyticsForPathname({
      pathname: "/en",
      decision: null,
      signal: new AbortController().signal,
      client,
      readRuntimeConfig,
    })).toBe(false);
    expect(readRuntimeConfig).not.toHaveBeenCalled();
    expect(commands).toEqual([]);
    expect(scripts).toEqual([]);
    expect(shouldShowAnalyticsConsent("/en", null, false)).toBe(true);
  });
});
