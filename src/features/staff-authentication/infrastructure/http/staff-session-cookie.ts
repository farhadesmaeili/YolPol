import {staffSessionLifetimeMs} from "@/features/staff-authentication/application/use-cases/authenticate-staff";

const productionCookieName = "__Host-yolpol_staff_session";
const developmentCookieName = "yolpol_staff_session";

export function staffSessionCookieName(environment: Readonly<{NODE_ENV?: string}> = process.env): string {
  return environment.NODE_ENV === "production" ? productionCookieName : developmentCookieName;
}

export function readStaffSessionCookie(request: Request, environment: Readonly<{NODE_ENV?: string}> = process.env): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const expectedName = staffSessionCookieName(environment);
  const values: string[] = [];
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0 || segment.slice(0, separator).trim() !== expectedName) continue;
    values.push(segment.slice(separator + 1).trim());
  }
  return values.length === 1 && values[0] ? values[0] : null;
}

function attributes(environment: Readonly<{NODE_ENV?: string}>): string {
  return `Path=/; HttpOnly; SameSite=Strict${environment.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function serializeStaffSessionCookie(credential: string, expiresAt: Date, environment: Readonly<{NODE_ENV?: string}> = process.env): string {
  if (!/^yps_[A-Za-z0-9_-]{43}$/u.test(credential) || !(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) {
    throw new Error("Staff session cookie input is invalid.");
  }
  return `${staffSessionCookieName(environment)}=${credential}; ${attributes(environment)}; Max-Age=${staffSessionLifetimeMs / 1_000}; Expires=${expiresAt.toUTCString()}`;
}

export function serializeClearedStaffSessionCookie(environment: Readonly<{NODE_ENV?: string}> = process.env): string {
  return `${staffSessionCookieName(environment)}=; ${attributes(environment)}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

