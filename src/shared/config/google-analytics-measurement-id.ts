export const googleAnalyticsMeasurementIdEnvironmentVariable =
  "YOLPOL_GOOGLE_ANALYTICS_MEASUREMENT_ID";

export type GoogleAnalyticsMeasurementId = `G-${string}`;

const googleAnalyticsMeasurementIdPattern = /^G-[A-Z0-9]{10}$/u;

export function parseGoogleAnalyticsMeasurementId(
  value: string | undefined,
): GoogleAnalyticsMeasurementId | null {
  const candidate = value?.trim();
  return candidate && googleAnalyticsMeasurementIdPattern.test(candidate)
    ? (candidate as GoogleAnalyticsMeasurementId)
    : null;
}
