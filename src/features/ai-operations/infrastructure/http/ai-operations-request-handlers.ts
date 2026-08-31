import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import type {GetAiOperationsPolicy} from "@/features/ai-operations/application/use-cases/get-ai-operations-policy";
import type {ReadAiOperationsAuditHistory} from "@/features/ai-operations/application/use-cases/read-ai-operations-audit-history";
import type {UpdateAiOperationsPolicy} from "@/features/ai-operations/application/use-cases/update-ai-operations-policy";
import type {AiScheduleWindowInput} from "@/features/ai-operations/domain/types/ai-operations-types";
import type {AiOperationsRateLimiter} from "@/features/ai-operations/infrastructure/http/ai-operations-rate-limiter";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

export const aiOperationsRequestSizeLimit = 32 * 1_024;

type Environment = Readonly<{NODE_ENV?: string}>;
type Access = Readonly<{resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>}>;
type Operations = Readonly<{
  getPolicy: Pick<GetAiOperationsPolicy, "execute">;
  updatePolicy: Pick<UpdateAiOperationsPolicy, "execute">;
  readAuditHistory: Pick<ReadAiOperationsAuditHistory, "execute">;
}>;
type Options = Readonly<{
  approvedDevelopmentOrigins?: ReadonlySet<string>;
  environment?: Environment;
  rateLimiter: Pick<AiOperationsRateLimiter, "consume">;
}>;

const json = (body: Readonly<Record<string, unknown>>, status: number, headers?: HeadersInit) => Response.json(body, {status, headers: {"Cache-Control": "no-store", ...headers}});
const failure = (code: string, status: number, headers?: HeadersInit, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status, headers);

async function authenticate(request: Request, getAccess: () => Access, options: Options): Promise<StaffPrincipal | Response> {
  const credential = readStaffSessionCookie(request, options.environment);
  if (!credential) return failure("unauthorized", 401);
  try {
    const result = await getAccess().resolveSession.execute({sessionCredential: credential});
    if (result.status === "unauthorized") return failure("unauthorized", 401);
    if (result.status !== "authenticated") return failure("service_unavailable", 503);
    return result.principal;
  } catch { return failure("service_unavailable", 503); }
}

function rejectsQuery(request: Request): boolean {
  try { return new URL(request.url).search.length > 0; } catch { return true; }
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).sort().join(",") === [...keys].sort().join(",");
}

export function createGetAiOperationsRequestHandler(getAccess: () => Access, getOperations: () => Operations, options: Options) {
  return async function handle(request: Request): Promise<Response> {
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    let result: Awaited<ReturnType<Operations["getPolicy"]["execute"]>>;
    try { result = await getOperations().getPolicy.execute(principal); }
    catch { return failure("service_unavailable", 503); }
    if (result.status === "forbidden") return failure("forbidden", 403);
    if (result.status !== "found") return failure(result.reason === "POLICY_INVALID" ? "policy_invalid" : "service_unavailable", 503);
    return json({status: "found", value: result.value}, 200);
  };
}

export function createUpdateAiOperationsRequestHandler(getAccess: () => Access, getOperations: () => Operations, options: Options) {
  return async function handle(request: Request): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    const rateLimit = options.rateLimiter.consume();
    if (!rateLimit.allowed) return failure("rate_limited", 429, {"Retry-After": String(rateLimit.retryAfterSeconds)});
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") return failure("unsupported_media_type", 415);
    const body = await readJsonBodyWithinLimit(request, aiOperationsRequestSizeLimit, "AI Operations request body exceeds limit.");
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status !== "success") return failure("invalid_request", 400);
    const record = plainRecord(body.value);
    if (!record || !exactKeys(record, ["expectedVersion", "mode", "businessTimeZone", "humanGracePeriodSeconds", "scheduleWindows"]) || !Array.isArray(record.scheduleWindows)) {
      return failure("invalid_request", 400);
    }
    const scheduleWindows: AiScheduleWindowInput[] = [];
    for (const value of record.scheduleWindows) {
      const window = plainRecord(value);
      if (!window || !exactKeys(window, ["weekday", "startMinute", "endMinute", "enabled"])) return failure("invalid_request", 400);
      scheduleWindows.push({weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute, enabled: window.enabled});
    }
    let result: Awaited<ReturnType<Operations["updatePolicy"]["execute"]>>;
    try {
      result = await getOperations().updatePolicy.execute({
        principal,
        expectedVersion: record.expectedVersion,
        mode: record.mode,
        businessTimeZone: record.businessTimeZone,
        humanGracePeriodSeconds: record.humanGracePeriodSeconds,
        scheduleWindows,
      });
    } catch { return failure("service_unavailable", 503); }
    if (result.status === "updated") return json(result, 200);
    if (result.status === "forbidden") return failure("forbidden", 403);
    if (result.status === "conflict") return failure("version_conflict", 409);
    if (result.status === "validation_failed") return failure("invalid_request", 400, undefined, result.field);
    if (result.status === "policy_invalid") return failure("policy_invalid", 503);
    return failure("service_unavailable", 503);
  };
}

export function createAiOperationsAuditRequestHandler(getAccess: () => Access, getOperations: () => Operations, options: Options) {
  return async function handle(request: Request): Promise<Response> {
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    let result: Awaited<ReturnType<Operations["readAuditHistory"]["execute"]>>;
    try { result = await getOperations().readAuditHistory.execute(principal); }
    catch { return failure("service_unavailable", 503); }
    if (result.status === "forbidden") return failure("forbidden", 403);
    if (result.status !== "found") return failure("service_unavailable", 503);
    return json({status: "found", events: result.events}, 200);
  };
}
