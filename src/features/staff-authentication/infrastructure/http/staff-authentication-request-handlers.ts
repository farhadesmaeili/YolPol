import type {AuthenticateStaffResult, LogoutStaffResult, ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import type {StaffLoginRateLimiter} from "@/features/staff-authentication/infrastructure/http/staff-login-rate-limiter";
import {readStaffSessionCookie, serializeClearedStaffSessionCookie, serializeStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {parseStaffLoginPayload} from "@/features/staff-authentication/infrastructure/validation/staff-login-payload";
import {presentStaffPrincipal} from "@/features/staff-authentication/presentation/presenters/staff-principal-presenter";
import {readJsonBodyWithinLimit, readTextBodyWithinLimit, type BoundedJsonBodyResult} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";
import {isSupportedLocale, type Locale} from "@/shared/types/locale";

export const staffLoginRequestSizeLimit = 4 * 1_024;

type StaffAuthenticator = Readonly<{execute(input: Readonly<{email: string; password: string}>): Promise<AuthenticateStaffResult>}>;
type StaffSessionResolver = Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>;
type StaffLogout = Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<LogoutStaffResult>}>;
type Environment = Readonly<{NODE_ENV?: string}>;

type StaffHttpOptions = Readonly<{
  approvedDevelopmentOrigins?: ReadonlySet<string>;
  environment?: Environment;
}>;

type StaffLoginHttpOptions = StaffHttpOptions & Readonly<{rateLimiter?: StaffLoginRateLimiter}>;

function json(body: Readonly<Record<string, unknown>>, status: number): Response {
  return Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
}

function unauthorized(): Response { return json({status: "error", code: "authentication_failed"}, 401); }
function unavailable(): Response { return json({status: "error", code: "service_unavailable"}, 503); }

function authenticatedResponse(result: Extract<AuthenticateStaffResult, {status: "authenticated"}>, mediaType: string, nativeLocale?: Locale): Response {
  if (mediaType === "application/x-www-form-urlencoded") {
    return new Response(null, {status: 303, headers: {"Cache-Control": "no-store", Location: nativeLocale ? `/${nativeLocale}/staff` : "/staff"}});
  }
  return json({status: "authenticated", principal: presentStaffPrincipal(result.principal)}, 200);
}

function methodNotAllowed(): Response {
  return Response.json(
    {status: "error", code: "method_not_allowed"},
    {status: 405, headers: {"Allow": "POST", "Cache-Control": "no-store"}},
  );
}

type ParsedUrlEncodedLoginBody = Readonly<{value: Readonly<{email: string; password: string}>; nativeLocale?: Locale}>;

function parseUrlEncodedLoginBody(value: string): ParsedUrlEncodedLoginBody | null {
  if (/%(?![0-9A-Fa-f]{2})/u.test(value)) return null;
  const parameters = new URLSearchParams(value);
  const emails = parameters.getAll("email");
  const passwords = parameters.getAll("password");
  const locales = parameters.getAll("locale");
  if (emails.length !== 1 || passwords.length !== 1 || locales.length > 1 || [...parameters.keys()].length !== 2 + locales.length) return null;
  const nativeLocale = locales[0];
  return {
    value: {email: emails[0]!, password: passwords[0]!},
    ...(nativeLocale && isSupportedLocale(nativeLocale) ? {nativeLocale} : {}),
  };
}

type StaffLoginBodyResult = BoundedJsonBodyResult & Readonly<{nativeLocale?: Locale}>;

async function readStaffLoginBody(request: Request, mediaType: string): Promise<StaffLoginBodyResult> {
  if (mediaType === "application/json") {
    return readJsonBodyWithinLimit(request, staffLoginRequestSizeLimit, "Staff login request body exceeds limit.");
  }
  const body = await readTextBodyWithinLimit(request, staffLoginRequestSizeLimit, "Staff login request body exceeds limit.");
  if (body.status !== "success") return body;
  const parsed = parseUrlEncodedLoginBody(body.value);
  return parsed === null ? {status: "invalid"} : {status: "success", ...parsed};
}

export function createStaffLoginRequestHandler(getAuthenticator: () => StaffAuthenticator, options: StaffLoginHttpOptions = {}) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return methodNotAllowed();
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return json({status: "error", code: "invalid_origin"}, 403);
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json" && mediaType !== "application/x-www-form-urlencoded") return json({status: "error", code: "unsupported_media_type"}, 415);
    const decision = options.rateLimiter?.consume();
    if (decision && !decision.allowed) {
      return Response.json({status: "error", code: "rate_limited"}, {status: 429, headers: {"Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds)}});
    }
    const body = await readStaffLoginBody(request, mediaType);
    if (body.status === "too_large") return json({status: "error", code: "payload_too_large"}, 413);
    if (body.status === "invalid") return json({status: "error", code: "invalid_request"}, 400);
    const input = parseStaffLoginPayload(body.value);
    if (!input) return json({status: "error", code: "invalid_request"}, 400);

    let result: AuthenticateStaffResult;
    try { result = await getAuthenticator().execute(input); }
    catch { return unavailable(); }
    if (result.status === "authentication_failed") return unauthorized();
    if (result.status !== "authenticated") return unavailable();

    const response = authenticatedResponse(result, mediaType, body.nativeLocale);
    try {
      response.headers.append("Set-Cookie", serializeStaffSessionCookie(result.sessionCredential, result.expiresAt, options.environment));
      return response;
    } catch {
      return unavailable();
    }
  };
}

export function createStaffSessionRequestHandler(getResolver: () => StaffSessionResolver, options: StaffHttpOptions = {}) {
  return async function handle(request: Request): Promise<Response> {
    const credential = readStaffSessionCookie(request, options.environment);
    if (!credential) return json({status: "unauthorized"}, 401);
    let result: ResolveStaffSessionResult;
    try { result = await getResolver().execute({sessionCredential: credential}); }
    catch { return unavailable(); }
    if (result.status === "unauthorized") return json({status: "unauthorized"}, 401);
    if (result.status !== "authenticated") return unavailable();
    return json({status: "authenticated", principal: presentStaffPrincipal(result.principal)}, 200);
  };
}

export function createStaffLogoutRequestHandler(getLogout: () => StaffLogout, options: StaffHttpOptions = {}) {
  return async function handle(request: Request): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return json({status: "error", code: "invalid_origin"}, 403);
    const credential = readStaffSessionCookie(request, options.environment) ?? "";
    let result: LogoutStaffResult;
    try { result = await getLogout().execute({sessionCredential: credential}); }
    catch { result = {status: "persistence_failed"}; }
    if (result.status !== "completed") return unavailable();
    const response = json({status: "logged_out"}, 200);
    response.headers.append("Set-Cookie", serializeClearedStaffSessionCookie(options.environment));
    return response;
  };
}
