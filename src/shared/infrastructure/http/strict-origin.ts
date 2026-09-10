import {readDeploymentEnvironmentContract} from "@/shared/config/deployment-environment";

export function originAllowed(request: Request, approvedDevelopmentOrigins: ReadonlySet<string> = new Set()): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let normalizedOrigin: string;
  let originUrl: URL;
  try { originUrl = new URL(origin); normalizedOrigin = originUrl.origin; } catch { return false; }
  if (origin !== normalizedOrigin) return false;
  let deployment;
  try { deployment = readDeploymentEnvironmentContract(); } catch { return false; }
  if (normalizedOrigin === deployment.applicationOrigin) return true;
  if (deployment.deploymentEnvironment !== "development") return false;
  if (approvedDevelopmentOrigins.has(normalizedOrigin)) return true;
  const requestUrl = new URL(request.url);
  const requestHost = request.headers.get("host") ?? requestUrl.host;
  return (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1" || originUrl.hostname === "[::1]") && originUrl.protocol === requestUrl.protocol && originUrl.host === requestHost;
}

export function strictOriginAllowed(request: Request, approvedDevelopmentOrigins: ReadonlySet<string> = new Set()): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin.length > 0 && originAllowed(request, approvedDevelopmentOrigins);
}
