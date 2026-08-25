import {siteConfig} from "@/shared/config/site";

export function originAllowed(request: Request, approvedDevelopmentOrigins: ReadonlySet<string> = new Set()): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let normalizedOrigin: string;
  let originUrl: URL;
  try { originUrl = new URL(origin); normalizedOrigin = originUrl.origin; } catch { return false; }
  if (origin !== normalizedOrigin) return false;
  if (normalizedOrigin === siteConfig.url) return true;
  if (process.env.NODE_ENV !== "development") return false;
  if (approvedDevelopmentOrigins.has(normalizedOrigin)) return true;
  const requestUrl = new URL(request.url);
  const requestHost = request.headers.get("host") ?? requestUrl.host;
  return (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1" || originUrl.hostname === "[::1]") && originUrl.protocol === requestUrl.protocol && originUrl.host === requestHost;
}

export function strictOriginAllowed(request: Request, approvedDevelopmentOrigins: ReadonlySet<string> = new Set()): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin.length > 0 && originAllowed(request, approvedDevelopmentOrigins);
}
