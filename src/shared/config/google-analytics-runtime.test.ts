import {describe, expect, it} from "vitest";

import {parseGoogleAnalyticsMeasurementId} from "@/shared/config/google-analytics-measurement-id";
import {readGoogleAnalyticsRuntimeConfig} from "@/shared/config/google-analytics-runtime";

const production = {
  NODE_ENV: "production",
  YOLPOL_DEPLOYMENT_ENVIRONMENT: "production",
  YOLPOL_APP_ORIGIN: "https://yolpol.com",
} as const;

describe("Google Analytics runtime configuration", () => {
  it("enables only a valid Production measurement ID", () => {
    expect(readGoogleAnalyticsRuntimeConfig({
      ...production,
      YOLPOL_GOOGLE_ANALYTICS_MEASUREMENT_ID: "G-76B2GKE2Q8",
    })).toEqual({enabled: true, measurementId: "G-76B2GKE2Q8"});
  });

  it.each([undefined, "", "UA-123456-1", "G-short", "G-123456789<script>", "https://example.com/tag.js"])(
    "fails closed for missing or invalid Production ID %j",
    (measurementId) => {
      expect(readGoogleAnalyticsRuntimeConfig({
        ...production,
        YOLPOL_GOOGLE_ANALYTICS_MEASUREMENT_ID: measurementId,
      })).toEqual({enabled: false});
    },
  );

  it.each([
    {NODE_ENV: "production", YOLPOL_DEPLOYMENT_ENVIRONMENT: "staging", YOLPOL_APP_ORIGIN: "https://staging.yolpol.com"},
    {NODE_ENV: "development"},
    {NODE_ENV: "test"},
  ] as const)("keeps $NODE_ENV/$YOLPOL_DEPLOYMENT_ENVIRONMENT analytics disabled", (environment) => {
    expect(readGoogleAnalyticsRuntimeConfig({
      ...environment,
      YOLPOL_GOOGLE_ANALYTICS_MEASUREMENT_ID: "G-76B2GKE2Q8",
    })).toEqual({enabled: false});
  });
});

describe("GA4 measurement ID parsing", () => {
  it.each(["G-76B2GKE2Q8", " G-ABC1234567 "])("accepts and safely trims %j", (value) => {
    expect(parseGoogleAnalyticsMeasurementId(value)).toBe(value.trim());
  });

  it.each([undefined, "", "G-ABC123", "g-ABC1234567", "G-ABC_234567", "G-ABC12345678", "GT-ABC1234567"])(
    "rejects malformed value %j",
    (value) => expect(parseGoogleAnalyticsMeasurementId(value)).toBeNull(),
  );
});
