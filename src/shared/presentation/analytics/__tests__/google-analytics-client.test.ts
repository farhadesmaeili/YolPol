import {describe, expect, it} from "vitest";

import {
  createGoogleAnalyticsBrowserAdapter,
  GoogleAnalyticsClient,
  parsePublicAnalyticsRuntimeConfig,
  parseStoredAnalyticsConsent,
  type GoogleAnalyticsBrowserAdapter,
  type GoogleTagWindow,
  type GoogleTagCommand,
} from "@/shared/presentation/analytics/google-analytics-client";
import type {GoogleAnalyticsMeasurementId} from "@/shared/config/google-analytics-measurement-id";

function harness(initialPathname = "/en/inquiry") {
  let pathname = initialPathname;
  const commands: GoogleTagCommand[] = [];
  const scripts: GoogleAnalyticsMeasurementId[] = [];
  const expired: GoogleAnalyticsMeasurementId[] = [];
  const adapter: GoogleAnalyticsBrowserAdapter = {
    send: (command) => commands.push(command),
    ensureExternalScript: (measurementId) => scripts.push(measurementId),
    currentPathname: () => pathname,
    pageContext: (pathname) => ({page_location: `https://yolpol.com${pathname}`, page_title: "Localized page"}),
    expireAnalyticsCookies: (measurementId) => expired.push(measurementId),
  };
  return {
    client: new GoogleAnalyticsClient(adapter),
    commands,
    scripts,
    expired,
    setPathname: (value: string) => { pathname = value; },
  };
}

describe("analytics consent storage", () => {
  it.each([
    [null, null], ["", null], ["corrupted", null], ["granted", "granted"], ["denied", "denied"],
  ] as const)("parses %j fail-closed", (stored, expected) => {
    expect(parseStoredAnalyticsConsent(stored)).toBe(expected);
  });
});

describe("Google Analytics browser client", () => {
  it("queues denied Consent Mode defaults without loading Google or sending events", () => {
    const {client, commands, scripts} = harness();
    client.defaultConsentDenied();
    expect(client.initialize("G-76B2GKE2Q8")).toBe(false);
    expect(client.trackPageView("/en")).toBe(false);
    expect(client.trackGenerateLead({locale: "en", productCount: 1})).toBe(false);
    expect(scripts).toEqual([]);
    expect(commands).toEqual([["consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    }]]);
  });

  it("loads and initializes an exact validated ID only after consent", () => {
    const {client, commands, scripts} = harness();
    client.grantConsent();
    expect(client.initialize("https://attacker.example/script.js")).toBe(false);
    expect(client.initialize("G-76B2GKE2Q8")).toBe(true);
    expect(client.initialize("G-76B2GKE2Q8")).toBe(true);
    expect(scripts).toEqual(["G-76B2GKE2Q8"]);
    expect(commands.filter(([command]) => command === "config")).toEqual([
      ["config", "G-76B2GKE2Q8", {send_page_view: false, anonymize_ip: true}],
    ]);
  });

  it("tracks sanitized path-only page views once per App Router pathname", () => {
    const {client, commands} = harness();
    client.grantConsent();
    client.initialize("G-76B2GKE2Q8");
    expect(client.trackPageView("/fa/inquiry")).toBe(true);
    expect(client.trackPageView("/fa/inquiry")).toBe(false);
    expect(client.trackPageView("/fa/inquiry?email=private@example.com")).toBe(false);
    expect(client.trackPageView("/en/staff/inquiries/internal-id")).toBe(false);
    expect(client.trackPageView("/en/private-future-route")).toBe(false);
    expect(client.trackPageView("/tr/privacy")).toBe(true);
    expect(commands.filter((command) => command[0] === "event" && command[1] === "page_view")).toEqual([
      ["event", "page_view", {page_location: "https://yolpol.com/fa/inquiry", page_path: "/fa/inquiry", page_title: "Localized page"}],
      ["event", "page_view", {page_location: "https://yolpol.com/tr/privacy", page_path: "/tr/privacy", page_title: "Localized page"}],
    ]);
  });

  it("emits the minimal generate_lead payload and no Inquiry PII", () => {
    const {client, commands} = harness();
    client.grantConsent();
    client.initialize("G-76B2GKE2Q8");
    expect(client.trackGenerateLead({locale: "ar", productCount: 2})).toBe(true);
    const lead = commands.find((command) => command[0] === "event" && command[1] === "generate_lead");
    expect(lead).toEqual(["event", "generate_lead", {form_name: "inquiry", locale: "ar", product_count: 2}]);
    expect(JSON.stringify(lead)).not.toMatch(/inquiryId|fullName|company|email|phone|whatsapp|telegram|message|city|destination|price|value|currency|chat/iu);
  });

  it("blocks generate_lead when the current browser route is not public", () => {
    const {client, commands, setPathname} = harness();
    client.grantConsent();
    client.initialize("G-76B2GKE2Q8");
    setPathname("/en/staff/inquiries/private-id");
    expect(client.trackGenerateLead({locale: "en", productCount: 1})).toBe(false);
    expect(commands.some((command) => command[0] === "event" && command[1] === "generate_lead")).toBe(false);
  });

  it("withdraws consent, stops later events, and requests cookie expiry", () => {
    const {client, commands, expired} = harness();
    client.grantConsent();
    client.initialize("G-76B2GKE2Q8");
    client.denyConsent();
    expect(client.trackPageView("/en/privacy")).toBe(false);
    expect(client.trackGenerateLead({locale: "en", productCount: 1})).toBe(false);
    expect(expired).toEqual(["G-76B2GKE2Q8"]);
    expect(commands.at(-1)).toEqual(["consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    }]);
  });
});

describe("Google Analytics browser adapter", () => {
  it("queues commands with Google's canonical arguments-object semantics", () => {
    const browserWindow = {
      document: {title: "Public page"},
      location: {origin: "https://yolpol.com", hostname: "yolpol.com", pathname: "/en"},
    } as unknown as GoogleTagWindow;
    const adapter = createGoogleAnalyticsBrowserAdapter(browserWindow);
    const command = ["event", "page_view", {
      page_location: "https://yolpol.com/en",
      page_path: "/en",
      page_title: "Public page",
    }] as const satisfies GoogleTagCommand;

    adapter.send(command);

    const queuedCommand = browserWindow.dataLayer?.[0];
    expect(queuedCommand).toBeDefined();
    expect(Array.isArray(queuedCommand)).toBe(false);
    expect(Object.prototype.toString.call(queuedCommand)).toBe("[object Arguments]");
    expect(Array.from(queuedCommand as ArrayLike<unknown>)).toEqual(command);
  });

  it("deduplicates the real external-script insertion by validated measurement ID", () => {
    const scripts: Array<{async: boolean; src: string; dataset: Record<string, string>}> = [];
    const document = {
      title: "Public page",
      cookie: "",
      querySelector: (selector: string) => scripts.find(
        ({dataset}) => selector === `script[data-yolpol-ga4-id="${dataset.yolpolGa4Id}"]`,
      ) ?? null,
      createElement: () => ({async: false, src: "", dataset: {}}),
      head: {append: (script: (typeof scripts)[number]) => scripts.push(script)},
    };
    const browserWindow = {
      document,
      location: {origin: "https://yolpol.com", hostname: "yolpol.com", pathname: "/en"},
    } as unknown as GoogleTagWindow;
    const adapter = createGoogleAnalyticsBrowserAdapter(browserWindow);

    adapter.ensureExternalScript("G-76B2GKE2Q8");
    adapter.ensureExternalScript("G-76B2GKE2Q8");

    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({
      async: true,
      src: "https://www.googletagmanager.com/gtag/js?id=G-76B2GKE2Q8",
      dataset: {yolpolGa4Id: "G-76B2GKE2Q8"},
    });
  });
});

describe("public analytics runtime response", () => {
  it("accepts only the exact safe response shape", () => {
    expect(parsePublicAnalyticsRuntimeConfig({enabled: true, measurementId: "G-76B2GKE2Q8"})).toEqual({enabled: true, measurementId: "G-76B2GKE2Q8"});
    expect(parsePublicAnalyticsRuntimeConfig({enabled: false})).toEqual({enabled: false});
    for (const value of [
      {enabled: true, measurementId: "G-invalid"},
      {enabled: true, measurementId: "G-76B2GKE2Q8", secret: "leak"},
      {enabled: false, measurementId: "G-76B2GKE2Q8"},
      null,
    ]) expect(parsePublicAnalyticsRuntimeConfig(value)).toEqual({enabled: false});
  });
});
