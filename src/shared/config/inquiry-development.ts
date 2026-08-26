export const developmentOriginEnvironmentVariable = "YOLPOL_DEV_ORIGIN";

export type DevelopmentOriginEnvironment = Readonly<{
  NODE_ENV?: string;
  YOLPOL_DEV_ORIGIN?: string;
}>;

export type DevelopmentOrigin = Readonly<{
  host: string;
  origin: string;
}>;

export function parseDevelopmentOrigin(value: string | undefined): DevelopmentOrigin | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${developmentOriginEnvironmentVariable} must be an absolute HTTP or HTTPS origin.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${developmentOriginEnvironmentVariable} must use HTTP or HTTPS.`);
  }
  if (!url.hostname) throw new Error(`${developmentOriginEnvironmentVariable} must include a valid host.`);
  if (url.username || url.password) throw new Error(`${developmentOriginEnvironmentVariable} must not include credentials.`);
  if (url.pathname !== "/") throw new Error(`${developmentOriginEnvironmentVariable} must not include a path.`);
  if (url.search || candidate.includes("?")) throw new Error(`${developmentOriginEnvironmentVariable} must not include a query string.`);
  if (url.hash || candidate.includes("#")) throw new Error(`${developmentOriginEnvironmentVariable} must not include a fragment.`);

  return Object.freeze({host: url.hostname, origin: url.origin});
}

export function getDevelopmentOrigin(environment: DevelopmentOriginEnvironment = process.env): DevelopmentOrigin | undefined {
  if (environment.NODE_ENV !== "development") return undefined;
  return parseDevelopmentOrigin(environment.YOLPOL_DEV_ORIGIN);
}

export function getApprovedDevelopmentOrigins(environment: DevelopmentOriginEnvironment = process.env): ReadonlySet<string> {
  const developmentOrigin = getDevelopmentOrigin(environment);
  return new Set(developmentOrigin ? [developmentOrigin.origin] : []);
}
