import {
  analyticsConsentStorageKey,
  fetchPublicAnalyticsRuntimeConfig,
  parseStoredAnalyticsConsent,
  type AnalyticsConsentDecision,
  type GoogleAnalyticsClient,
  type PublicAnalyticsRuntimeConfig,
} from "@/shared/presentation/analytics/google-analytics-client";
import {isPublicAnalyticsPathname} from "@/shared/presentation/analytics/public-analytics-pathname";

type AnalyticsConsentStorageReader = Pick<Storage, "getItem">;
type AnalyticsConsentStorageWriter = Pick<Storage, "setItem">;
type AnalyticsRuntimeConfigReader = (signal: AbortSignal) => Promise<PublicAnalyticsRuntimeConfig>;

export function readStoredAnalyticsConsent(
  storage: AnalyticsConsentStorageReader,
): AnalyticsConsentDecision | null {
  try {
    return parseStoredAnalyticsConsent(storage.getItem(analyticsConsentStorageKey));
  } catch {
    return null;
  }
}

export function persistAnalyticsConsent(
  storage: AnalyticsConsentStorageWriter,
  decision: AnalyticsConsentDecision,
): void {
  try {
    storage.setItem(analyticsConsentStorageKey, decision);
  } catch {
    // The in-memory choice still applies for this page when storage is unavailable.
  }
}

export function shouldShowAnalyticsConsent(
  pathname: string,
  decision: AnalyticsConsentDecision | null | undefined,
  preferencesOpen: boolean,
): boolean {
  return isPublicAnalyticsPathname(pathname) && (decision === null || preferencesOpen);
}

export function shouldRenderAnalyticsSettingsControl(pathname: string): boolean {
  return isPublicAnalyticsPathname(pathname);
}

export async function activateGoogleAnalyticsForPathname(input: Readonly<{
  pathname: string;
  decision: AnalyticsConsentDecision | null | undefined;
  signal: AbortSignal;
  client: GoogleAnalyticsClient;
  readRuntimeConfig?: AnalyticsRuntimeConfigReader;
}>): Promise<boolean> {
  if (input.decision !== "granted" || !isPublicAnalyticsPathname(input.pathname)) {
    return false;
  }

  input.client.grantConsent();
  if (input.client.isInitialized()) {
    return input.client.trackPageView(input.pathname);
  }

  const config = await (input.readRuntimeConfig ?? fetchPublicAnalyticsRuntimeConfig)(input.signal);
  if (!config.enabled || input.signal.aborted) return false;
  return input.client.initialize(config.measurementId)
    && input.client.trackPageView(input.pathname);
}
