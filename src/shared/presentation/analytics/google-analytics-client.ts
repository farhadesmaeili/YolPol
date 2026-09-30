import {
  parseGoogleAnalyticsMeasurementId,
  type GoogleAnalyticsMeasurementId,
} from "@/shared/config/google-analytics-measurement-id";
import {isPublicAnalyticsPathname} from "@/shared/presentation/analytics/public-analytics-pathname";
import type {Locale} from "@/shared/types/locale";

export const analyticsConsentStorageKey = "yolpol.analytics-consent.v1";

export type AnalyticsConsentDecision = "granted" | "denied";

type ConsentSettings = Readonly<{
  analytics_storage: "denied" | "granted";
  ad_storage: "denied";
  ad_user_data: "denied";
  ad_personalization: "denied";
}>;

export type GoogleTagCommand =
  | readonly ["consent", "default" | "update", ConsentSettings]
  | readonly ["js", Date]
  | readonly ["config", GoogleAnalyticsMeasurementId, Readonly<{send_page_view: false; anonymize_ip: true}>]
  | readonly ["event", "page_view", Readonly<{page_location: string; page_path: string; page_title: string}>]
  | readonly ["event", "generate_lead", Readonly<{form_name: "inquiry"; locale: Locale; product_count: number}>];

export type GoogleAnalyticsBrowserAdapter = Readonly<{
  send(command: GoogleTagCommand): void;
  ensureExternalScript(measurementId: GoogleAnalyticsMeasurementId): void;
  currentPathname(): string;
  pageContext(pathname: string): Readonly<{page_location: string; page_title: string}>;
  expireAnalyticsCookies(measurementId: GoogleAnalyticsMeasurementId): void;
}>;

const deniedConsent: ConsentSettings = Object.freeze({
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
});

const grantedAnalyticsConsent: ConsentSettings = Object.freeze({
  ...deniedConsent,
  analytics_storage: "granted",
});

export class GoogleAnalyticsClient {
  private consent: AnalyticsConsentDecision | null = null;
  private defaultConsentSent = false;
  private measurementId: GoogleAnalyticsMeasurementId | null = null;
  private lastPagePath: string | null = null;

  constructor(private readonly browser: GoogleAnalyticsBrowserAdapter) {}

  defaultConsentDenied(): void {
    if (this.defaultConsentSent) return;
    this.browser.send(["consent", "default", deniedConsent]);
    this.defaultConsentSent = true;
  }

  grantConsent(): void {
    this.defaultConsentDenied();
    if (this.consent === "granted") return;
    this.consent = "granted";
    this.browser.send(["consent", "update", grantedAnalyticsConsent]);
  }

  denyConsent(): void {
    this.defaultConsentDenied();
    const activeMeasurementId = this.measurementId;
    if (this.consent !== "denied") {
      this.browser.send(["consent", "update", deniedConsent]);
    }
    this.consent = "denied";
    this.measurementId = null;
    this.lastPagePath = null;
    if (activeMeasurementId) {
      this.browser.expireAnalyticsCookies(activeMeasurementId);
    }
  }

  initialize(measurementId: string): boolean {
    const parsed = parseGoogleAnalyticsMeasurementId(measurementId);
    if (this.consent !== "granted" || !parsed) return false;
    if (this.measurementId === parsed) return true;
    if (this.measurementId !== null) return false;

    this.browser.ensureExternalScript(parsed);
    this.browser.send(["js", new Date()]);
    this.browser.send(["config", parsed, {send_page_view: false, anonymize_ip: true}]);
    this.measurementId = parsed;
    return true;
  }

  trackPageView(pathname: string): boolean {
    if (this.consent !== "granted" || this.measurementId === null) return false;
    if (!isPublicAnalyticsPathname(pathname)) return false;
    if (this.lastPagePath === pathname) return false;

    const page = this.browser.pageContext(pathname);
    this.browser.send(["event", "page_view", {
      page_location: page.page_location,
      page_path: pathname,
      page_title: page.page_title,
    }]);
    this.lastPagePath = pathname;
    return true;
  }

  trackGenerateLead(input: Readonly<{locale: Locale; productCount: number}>): boolean {
    if (this.consent !== "granted" || this.measurementId === null) return false;
    if (!isPublicAnalyticsPathname(this.browser.currentPathname())) return false;
    if (!Number.isSafeInteger(input.productCount) || input.productCount < 1) return false;
    this.browser.send(["event", "generate_lead", {
      form_name: "inquiry",
      locale: input.locale,
      product_count: input.productCount,
    }]);
    return true;
  }

  isInitialized(): boolean {
    return this.consent === "granted" && this.measurementId !== null;
  }
}

export type GoogleTagWindow = Window &
  typeof globalThis & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };

export function createGoogleAnalyticsBrowserAdapter(
  browserWindow: GoogleTagWindow,
): GoogleAnalyticsBrowserAdapter {
  function ensureQueue(): void {
    browserWindow.dataLayer ??= [];
    browserWindow.gtag ??= function gtag() {
      // Google's canonical queue requires the intrinsic arguments object; a rest parameter creates an Array.
      // eslint-disable-next-line prefer-rest-params
      browserWindow.dataLayer?.push(arguments);
    };
  }

  return {
    send(command) {
      ensureQueue();
      browserWindow.gtag?.(...command);
    },
    ensureExternalScript(measurementId) {
      const selector = `script[data-yolpol-ga4-id="${measurementId}"]`;
      if (browserWindow.document.querySelector(selector)) return;
      const url = new URL("https://www.googletagmanager.com/gtag/js");
      url.searchParams.set("id", measurementId);
      const script = browserWindow.document.createElement("script");
      script.async = true;
      script.src = url.toString();
      script.dataset.yolpolGa4Id = measurementId;
      browserWindow.document.head.append(script);
    },
    currentPathname() {
      return browserWindow.location.pathname;
    },
    pageContext(pathname) {
      return {
        page_location: `${browserWindow.location.origin}${pathname}`,
        page_title: browserWindow.document.title,
      };
    },
    expireAnalyticsCookies(measurementId) {
      const cookieNames = ["_ga", `_ga_${measurementId.slice(2)}`];
      const hostname = browserWindow.location.hostname;
      for (const cookieName of cookieNames) {
        browserWindow.document.cookie = `${cookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
        if (hostname.includes(".")) {
          browserWindow.document.cookie = `${cookieName}=; Max-Age=0; Path=/; Domain=.${hostname}; SameSite=Lax`;
        }
      }
    },
  };
}

let browserClient: GoogleAnalyticsClient | null = null;

export function getGoogleAnalyticsClient(): GoogleAnalyticsClient {
  browserClient ??= new GoogleAnalyticsClient(createGoogleAnalyticsBrowserAdapter(window));
  return browserClient;
}

export function parseStoredAnalyticsConsent(value: string | null): AnalyticsConsentDecision | null {
  return value === "granted" || value === "denied" ? value : null;
}

export function trackGenerateLead(input: Readonly<{locale: Locale; productCount: number}>): boolean {
  return getGoogleAnalyticsClient().trackGenerateLead(input);
}

export type PublicAnalyticsRuntimeConfig =
  | Readonly<{enabled: false}>
  | Readonly<{enabled: true; measurementId: GoogleAnalyticsMeasurementId}>;

export function parsePublicAnalyticsRuntimeConfig(value: unknown): PublicAnalyticsRuntimeConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {enabled: false};
  const record = value as Record<string, unknown>;
  if (record.enabled === false && Object.keys(record).length === 1) return {enabled: false};
  const measurementId = typeof record.measurementId === "string"
    ? parseGoogleAnalyticsMeasurementId(record.measurementId)
    : null;
  return record.enabled === true && measurementId && Object.keys(record).sort().join(",") === "enabled,measurementId"
    ? {enabled: true, measurementId}
    : {enabled: false};
}

export async function fetchPublicAnalyticsRuntimeConfig(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<PublicAnalyticsRuntimeConfig> {
  try {
    const response = await fetcher("/api/analytics/config", {
      cache: "no-store",
      headers: {Accept: "application/json"},
      signal,
    });
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
      return {enabled: false};
    }
    return parsePublicAnalyticsRuntimeConfig(await response.json());
  } catch (error) {
    if (signal.aborted) throw error;
    return {enabled: false};
  }
}
