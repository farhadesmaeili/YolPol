import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import type {AiProviderRegistryRateLimiter} from "@/features/ai-provider-registry/infrastructure/http/ai-provider-registry-rate-limiter";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

export const aiProviderRegistryRequestSizeLimit = 32 * 1_024;
type Access = Readonly<{resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>}>;
type Command = Readonly<{execute(input: Record<string, unknown> & {principal: StaffPrincipal}): Promise<Readonly<{status: string; [key: string]: unknown}>>}>;
type Registry = Readonly<{getRegistry: Readonly<{execute(principal: StaffPrincipal): Promise<Readonly<{status: string; [key: string]: unknown}>>}>; readAuditHistory: Readonly<{execute(principal: StaffPrincipal): Promise<Readonly<{status: string; [key: string]: unknown}>>}>; saveProvider: Command; saveProfile: Command; saveCredentialReference: Command}>;
type Options = Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; environment?: Readonly<{NODE_ENV?: string}>; rateLimiter: Pick<AiProviderRegistryRateLimiter, "consume">}>;

const json = (body: Readonly<Record<string, unknown>>, status: number, headers?: HeadersInit) => Response.json(body, {status, headers: {"Cache-Control": "no-store", ...headers}});
const failure = (code: string, status: number, headers?: HeadersInit, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status, headers);
const record = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype ? value as Record<string, unknown> : null;
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const rejectsQuery = (request: Request) => { try { return new URL(request.url).search.length > 0; } catch { return true; } };

async function authenticate(request: Request, getAccess: () => Access, options: Options): Promise<StaffPrincipal | Response> {
  const credential = readStaffSessionCookie(request, options.environment); if (!credential) return failure("unauthorized", 401);
  try { const result = await getAccess().resolveSession.execute({sessionCredential: credential}); return result.status === "authenticated" ? result.principal : result.status === "unauthorized" ? failure("unauthorized", 401) : failure("service_unavailable", 503); }
  catch { return failure("service_unavailable", 503); }
}

export function createGetAiProviderRegistryHandler(getAccess: () => Access, getRegistry: () => Registry, options: Options) {
  return async (request: Request): Promise<Response> => {
    if (rejectsQuery(request)) return failure("invalid_request", 400); const principal = await authenticate(request, getAccess, options); if (principal instanceof Response) return principal;
    try { const result = await getRegistry().getRegistry.execute(principal); return result.status === "found" ? json(result, 200) : result.status === "forbidden" ? failure("forbidden", 403) : failure("service_unavailable", 503); } catch { return failure("service_unavailable", 503); }
  };
}

const shapes = {
  SAVE_PROVIDER: ["operation", "expectedVersion", "id", "adapterKey", "displayName", "enabled", "priority"],
  SAVE_PROFILE: ["operation", "expectedVersion", "id", "providerId", "name", "modelIdentifier", "enabled", "priority", "capabilities", "generationSettings"],
  SAVE_CREDENTIAL_REFERENCE: ["operation", "expectedVersion", "id", "providerId", "alias", "credentialReference", "enabled", "priority"],
} as const;

export function createMutateAiProviderRegistryHandler(getAccess: () => Access, getRegistry: () => Registry, options: Options) {
  return async (request: Request): Promise<Response> => {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403); if (rejectsQuery(request)) return failure("invalid_request", 400);
    const principal = await authenticate(request, getAccess, options); if (principal instanceof Response) return principal;
    const rate = options.rateLimiter.consume(); if (!rate.allowed) return failure("rate_limited", 429, {"Retry-After": String(rate.retryAfterSeconds)});
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure("unsupported_media_type", 415);
    const body = await readJsonBodyWithinLimit(request, aiProviderRegistryRequestSizeLimit, "AI provider registry request body exceeds limit."); if (body.status === "too_large") return failure("payload_too_large", 413); if (body.status !== "success") return failure("invalid_request", 400);
    const input = record(body.value); if (!input || typeof input.operation !== "string" || !(input.operation in shapes)) return failure("invalid_request", 400);
    const operation = input.operation as keyof typeof shapes; if (!exact(input, shapes[operation])) return failure("invalid_request", 400);
    if (operation === "SAVE_PROFILE" && (!Array.isArray(input.capabilities) || !record(input.generationSettings))) return failure("invalid_request", 400);
    const command = operation === "SAVE_PROVIDER" ? getRegistry().saveProvider : operation === "SAVE_PROFILE" ? getRegistry().saveProfile : getRegistry().saveCredentialReference;
    try {
      const result = await command.execute({...input, principal});
      if (result.status === "saved") return json(result, 200); if (result.status === "forbidden") return failure("forbidden", 403); if (result.status === "conflict") return failure("version_conflict", 409);
      if (result.status === "validation_failed") return failure("invalid_request", 400, undefined, typeof result.field === "string" ? result.field : undefined); return failure("service_unavailable", 503);
    } catch { return failure("service_unavailable", 503); }
  };
}

export function createAiProviderRegistryAuditHandler(getAccess: () => Access, getRegistry: () => Registry, options: Options) {
  return async (request: Request): Promise<Response> => {
    if (rejectsQuery(request)) return failure("invalid_request", 400); const principal = await authenticate(request, getAccess, options); if (principal instanceof Response) return principal;
    try { const result = await getRegistry().readAuditHistory.execute(principal); return result.status === "found" ? json(result, 200) : result.status === "forbidden" ? failure("forbidden", 403) : failure("service_unavailable", 503); } catch { return failure("service_unavailable", 503); }
  };
}
