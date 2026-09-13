import "server-only";

import {getDevelopmentOrigin} from "@/shared/config/inquiry-development";
import {siteConfig} from "@/shared/config/site";

export const deploymentEnvironmentVariable = "YOLPOL_DEPLOYMENT_ENVIRONMENT";
export const applicationOriginEnvironmentVariable = "YOLPOL_APP_ORIGIN";

export type DeploymentEnvironment = "development" | "test" | "staging" | "production";

export type DeploymentEnvironmentSource = Readonly<{
  NODE_ENV?: string;
  YOLPOL_APP_ORIGIN?: string;
  YOLPOL_DEPLOYMENT_ENVIRONMENT?: string;
  YOLPOL_DEV_ORIGIN?: string;
}>;

export type DeploymentEnvironmentContract = Readonly<{
  deploymentEnvironment: DeploymentEnvironment;
  applicationOrigin: string;
  searchIndexingEnabled: boolean;
}>;

export class InvalidDeploymentEnvironmentConfigurationError extends Error {
  readonly name = "InvalidDeploymentEnvironmentConfigurationError";
}

function invalid(message: string): InvalidDeploymentEnvironmentConfigurationError {
  return new InvalidDeploymentEnvironmentConfigurationError(message);
}

export function parseDeploymentEnvironment(
  environment: DeploymentEnvironmentSource,
): DeploymentEnvironment {
  const configured = environment.YOLPOL_DEPLOYMENT_ENVIRONMENT?.trim();

  if (environment.NODE_ENV === "production") {
    if (configured === "staging" || configured === "production") return configured;
    throw invalid(`${deploymentEnvironmentVariable} must be staging or production when NODE_ENV=production.`);
  }

  if (environment.NODE_ENV === "test") {
    return "test";
  }

  if (environment.NODE_ENV === undefined || environment.NODE_ENV === "development") {
    if (configured === undefined || configured === "" || configured === "development") return "development";
    throw invalid(`${deploymentEnvironmentVariable} must be development when NODE_ENV=development.`);
  }

  throw invalid(`NODE_ENV ${JSON.stringify(environment.NODE_ENV)} is not supported by the YOLPOL deployment contract.`);
}

export function parseApplicationOrigin(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) throw invalid(`${applicationOriginEnvironmentVariable} is required.`);

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw invalid(`${applicationOriginEnvironmentVariable} must be a valid absolute HTTPS origin.`);
  }

  if (
    url.protocol !== "https:"
    || url.origin === "null"
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || candidate.includes("?")
    || url.hash !== ""
    || candidate.includes("#")
  ) {
    throw invalid(`${applicationOriginEnvironmentVariable} must be an HTTPS origin without credentials, path, query, or fragment.`);
  }

  return url.origin;
}

export function readDeploymentEnvironmentContract(
  environment: DeploymentEnvironmentSource = process.env,
): DeploymentEnvironmentContract {
  const deploymentEnvironment = parseDeploymentEnvironment(environment);

  if (deploymentEnvironment === "development") {
    return Object.freeze({
      deploymentEnvironment,
      applicationOrigin: getDevelopmentOrigin(environment)?.origin ?? "http://localhost:3000",
      searchIndexingEnabled: true,
    });
  }

  if (deploymentEnvironment === "test") {
    return Object.freeze({
      deploymentEnvironment,
      applicationOrigin: siteConfig.url,
      searchIndexingEnabled: true,
    });
  }

  const applicationOrigin = parseApplicationOrigin(environment.YOLPOL_APP_ORIGIN);
  if (deploymentEnvironment === "production" && applicationOrigin !== siteConfig.url) {
    throw invalid(`${applicationOriginEnvironmentVariable} must equal the canonical Production origin in Production.`);
  }
  if (deploymentEnvironment === "staging" && applicationOrigin === siteConfig.url) {
    throw invalid(`${applicationOriginEnvironmentVariable} must not equal the canonical Production origin in Staging.`);
  }

  return Object.freeze({
    deploymentEnvironment,
    applicationOrigin,
    searchIndexingEnabled: deploymentEnvironment === "production",
  });
}

export function runtimeApplicationOrigin(
  environment: DeploymentEnvironmentSource = process.env,
): string {
  return readDeploymentEnvironmentContract(environment).applicationOrigin;
}

export function searchIndexingEnabled(
  environment: DeploymentEnvironmentSource = process.env,
): boolean {
  try {
    return readDeploymentEnvironmentContract(environment).searchIndexingEnabled;
  } catch {
    return false;
  }
}

export function searchEngineResponseDirective(
  environment: DeploymentEnvironmentSource = process.env,
): string | undefined {
  return searchIndexingEnabled(environment) ? undefined : "noindex, nofollow, noarchive";
}
