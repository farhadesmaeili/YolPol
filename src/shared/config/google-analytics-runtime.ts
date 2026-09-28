import "server-only";

import {
  readDeploymentEnvironmentContract,
  type DeploymentEnvironmentSource,
} from "@/shared/config/deployment-environment";
import {
  parseGoogleAnalyticsMeasurementId,
  type GoogleAnalyticsMeasurementId,
} from "@/shared/config/google-analytics-measurement-id";

export type GoogleAnalyticsRuntimeEnvironment = DeploymentEnvironmentSource &
  Readonly<{YOLPOL_GOOGLE_ANALYTICS_MEASUREMENT_ID?: string}>;

export type GoogleAnalyticsRuntimeConfig =
  | Readonly<{enabled: false}>
  | Readonly<{
      enabled: true;
      measurementId: GoogleAnalyticsMeasurementId;
    }>;

const disabledGoogleAnalyticsConfig = Object.freeze({enabled: false} as const);

export function readGoogleAnalyticsRuntimeConfig(
  environment: GoogleAnalyticsRuntimeEnvironment = process.env,
): GoogleAnalyticsRuntimeConfig {
  try {
    const deployment = readDeploymentEnvironmentContract(environment);
    if (deployment.deploymentEnvironment !== "production") {
      return disabledGoogleAnalyticsConfig;
    }

    const measurementId = parseGoogleAnalyticsMeasurementId(
      environment.YOLPOL_GOOGLE_ANALYTICS_MEASUREMENT_ID,
    );
    return measurementId
      ? Object.freeze({enabled: true, measurementId})
      : disabledGoogleAnalyticsConfig;
  } catch {
    return disabledGoogleAnalyticsConfig;
  }
}
