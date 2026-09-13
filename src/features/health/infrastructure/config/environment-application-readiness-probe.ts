import packageMetadata from "../../../../../package.json";

import type {ApplicationReadinessProbe} from "@/features/health/application/ports/health-readiness-ports";
import type {BuildIdentity} from "@/features/health/domain/types/health-status";
import {readDeploymentEnvironmentContract} from "@/shared/config/deployment-environment";
import {parseLogLevel} from "@/shared/infrastructure/observability/structured-logger";

export const gitRevisionEnvironmentVariable = "YOLPOL_GIT_REVISION";
const gitRevisionPattern = /^[a-f0-9]{7,64}$/u;

type HealthEnvironment = Readonly<Record<string, string | undefined>> & Readonly<{
  NODE_ENV?: string;
  YOLPOL_APP_ORIGIN?: string;
  YOLPOL_DEPLOYMENT_ENVIRONMENT?: string;
  YOLPOL_DEV_ORIGIN?: string;
  YOLPOL_GIT_REVISION?: string;
  YOLPOL_LOG_LEVEL?: string;
}>;

export function readBuildIdentity(environment: HealthEnvironment = process.env): BuildIdentity {
  const candidate = environment.YOLPOL_GIT_REVISION?.trim().toLowerCase();
  if (candidate !== undefined && candidate !== "" && !gitRevisionPattern.test(candidate)) {
    throw new Error(`${gitRevisionEnvironmentVariable} must be a 7-64 character hexadecimal Git revision.`);
  }
  return Object.freeze({
    version: packageMetadata.version,
    ...(candidate ? {revision: candidate} : {}),
  });
}

export class EnvironmentApplicationReadinessProbe implements ApplicationReadinessProbe {
  constructor(private readonly environment: HealthEnvironment = process.env) {}

  check(): BuildIdentity {
    readDeploymentEnvironmentContract(this.environment);
    parseLogLevel(this.environment.YOLPOL_LOG_LEVEL);
    return readBuildIdentity(this.environment);
  }
}
