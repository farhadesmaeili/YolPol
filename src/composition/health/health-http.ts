import "server-only";

import {CheckReadiness} from "@/features/health/application/use-cases/check-readiness";
import {EnvironmentApplicationReadinessProbe} from "@/features/health/infrastructure/config/environment-application-readiness-probe";
import {PostgresDatabaseReadinessProbe} from "@/features/health/infrastructure/database/postgres-database-readiness-probe";
import {ThrottledHealthDiagnosticLogger} from "@/features/health/infrastructure/observability/throttled-health-diagnostic-logger";
import {createLivenessRequestHandler, createReadinessRequestHandler} from "@/features/health/presentation/adapters/health-request-handlers";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {createStructuredLogger} from "@/shared/infrastructure/observability/structured-logger";

function createHealthLogger() {
  try {
    return createStructuredLogger({service: "health"});
  } catch {
    return createStructuredLogger({
      service: "health",
      environment: {NODE_ENV: process.env.NODE_ENV, YOLPOL_LOG_LEVEL: "info"},
    });
  }
}

let healthDatabase: ReturnType<typeof getInquiryPostgresPool> | undefined;

function getHealthDatabase(): ReturnType<typeof getInquiryPostgresPool> {
  healthDatabase ??= getInquiryPostgresPool();
  return healthDatabase;
}

const checkReadiness = new CheckReadiness(
  new EnvironmentApplicationReadinessProbe(),
  new PostgresDatabaseReadinessProbe(getHealthDatabase),
  new ThrottledHealthDiagnosticLogger(createHealthLogger()),
);

export const healthLiveHandler = createLivenessRequestHandler();
export const healthReadyHandler = createReadinessRequestHandler(checkReadiness);
