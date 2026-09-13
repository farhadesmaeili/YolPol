import type {ChangeGlobalTranslationDefaults} from "@/features/conversation-translation/application/use-cases/change-global-translation-defaults";
import type {GetGlobalTranslationDefaults} from "@/features/conversation-translation/application/use-cases/get-global-translation-defaults";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {parseGlobalTranslationDefaultsPayload} from "@/features/conversation-translation/infrastructure/validation/translation-control-payload";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

export const globalTranslationSettingsRequestSizeLimit = 8 * 1_024;
type Access = Readonly<{resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>}>;
type Settings = Readonly<{
  getGlobalDefaults: Pick<GetGlobalTranslationDefaults, "execute">;
  changeGlobalDefaults: Pick<ChangeGlobalTranslationDefaults, "execute">;
}>;
type Options = Readonly<{
  approvedDevelopmentOrigins?: ReadonlySet<string>;
  environment?: Readonly<{NODE_ENV?: string}>;
  rateLimiter: Readonly<{consume(): Readonly<{allowed: boolean; retryAfterSeconds?: number}>}>;
}>;

const json = (body: Readonly<Record<string, unknown>>, status: number, headers?: HeadersInit) => Response.json(body, {status, headers: {"Cache-Control": "no-store", ...headers}});
const failure = (code: string, status: number, field?: string, headers?: HeadersInit) => json({status: "error", code, ...(field ? {field} : {})}, status, headers);

async function authenticate(request: Request, getAccess: () => Access, options: Options) {
  const credential = readStaffSessionCookie(request, options.environment);
  if (!credential) return failure("unauthorized", 401);
  try {
    const session = await getAccess().resolveSession.execute({sessionCredential: credential});
    if (session.status === "unauthorized") return failure("unauthorized", 401);
    return session.status === "authenticated" ? session.principal : failure("service_unavailable", 503);
  } catch { return failure("service_unavailable", 503); }
}

function rejectsQuery(request: Request): boolean {
  try { return new URL(request.url).search.length > 0; } catch { return true; }
}

export function createGetGlobalTranslationSettingsRequestHandler(getAccess: () => Access, getSettings: () => Settings, options: Options) {
  return async function handle(request: Request): Promise<Response> {
    if (rejectsQuery(request)) return failure("invalid_request", 400, "query");
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    const result = await getSettings().getGlobalDefaults.execute(principal);
    if (result.status === "forbidden") return failure("forbidden", 403);
    return result.status === "found" ? json({status: "found", value: result.value}, 200) : failure("service_unavailable", 503);
  };
}

export function createUpdateGlobalTranslationSettingsRequestHandler(getAccess: () => Access, getSettings: () => Settings, options: Options) {
  return async function handle(request: Request): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    if (rejectsQuery(request)) return failure("invalid_request", 400, "query");
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    const rateLimit = options.rateLimiter.consume();
    if (!rateLimit.allowed) return failure("rate_limited", 429, undefined, {"Retry-After": String(rateLimit.retryAfterSeconds ?? 1)});
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure("unsupported_media_type", 415);
    const body = await readJsonBodyWithinLimit(request, globalTranslationSettingsRequestSizeLimit, "Global translation settings request exceeds limit.");
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status !== "success") return failure("invalid_request", 400);
    const parsed = parseGlobalTranslationDefaultsPayload(body.value);
    if (parsed.status === "failure") return failure("invalid_request", 400, parsed.field);
    if (parsed.value.action !== "SET") return failure("invalid_request", 400);
    const {customerToStaffMode, staffToCustomerMode, aiToStaffMode, expectedVersion} = parsed.value;
    const result = await getSettings().changeGlobalDefaults.execute({customerToStaffMode, staffToCustomerMode, aiToStaffMode, expectedVersion, principal});
    if (result.status === "forbidden") return failure("forbidden", 403);
    if (result.status === "conflict") return failure("version_conflict", 409);
    if (result.status === "validation_failed") return failure("invalid_request", 400, result.field);
    if (result.status !== "updated") return failure("service_unavailable", 503);
    const current = await getSettings().getGlobalDefaults.execute(principal);
    return current.status === "found" ? json({status: "updated", value: current.value}, 200) : failure("service_unavailable", 503);
  };
}
