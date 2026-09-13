import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import type {ActivateStaffInvitation} from "@/features/staff-authentication/application/use-cases/activate-staff-invitation";
import type {CreateStaffInvitation} from "@/features/staff-authentication/application/use-cases/create-staff-invitation";
import type {ListStaffTeam} from "@/features/staff-authentication/application/use-cases/list-staff-team";
import type {ChangeStaffRole, SetStaffActive} from "@/features/staff-authentication/application/use-cases/manage-staff-account";
import type {RevokeStaffInvitation} from "@/features/staff-authentication/application/use-cases/revoke-staff-invitation";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

export const staffManagementRequestSizeLimit = 8 * 1_024;

type Environment = Readonly<{NODE_ENV?: string}>;
type Options = Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; environment?: Environment}>;
type Access = Readonly<{resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>}>;
type Management = Readonly<{
  activateInvitation: Pick<ActivateStaffInvitation, "execute">;
  createInvitation: Pick<CreateStaffInvitation, "execute">;
  listTeam: Pick<ListStaffTeam, "execute">;
  changeRole: Pick<ChangeStaffRole, "execute">;
  setActive: Pick<SetStaffActive, "execute">;
  revokeInvitation: Pick<RevokeStaffInvitation, "execute">;
}>;
type IdContext<TName extends string> = Readonly<{params: Promise<Record<TName, string>>}>;

const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: string, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);

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

function plainRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
    ? value as Record<string, unknown>
    : null;
}

async function jsonPayload(request: Request, keys: readonly string[]): Promise<Record<string, unknown> | Response> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return failure("unsupported_media_type", 415);
  const body = await readJsonBodyWithinLimit(request, staffManagementRequestSizeLimit, "Staff management request body exceeds limit.");
  if (body.status === "too_large") return failure("payload_too_large", 413);
  if (body.status === "invalid") return failure("invalid_request", 400);
  const record = plainRecord(body.value);
  if (!record || Object.keys(record).sort().join(",") !== [...keys].sort().join(",")) return failure("invalid_request", 400);
  return record;
}

function rejectsQuery(request: Request): boolean {
  try { return new URL(request.url).search.length > 0; } catch { return true; }
}

function mutationStatus(status: string): Response {
  switch (status) {
    case "changed": case "revoked": return json({status}, 200);
    case "not_found": return failure("not_found", 404);
    case "last_super_admin": return failure("last_super_admin", 409);
    case "unchanged": case "unavailable": return failure("conflict", 409);
    case "validation_failed": return failure("invalid_request", 400);
    case "forbidden": return failure("forbidden", 403);
    default: return failure("service_unavailable", 503);
  }
}

export function createStaffTeamRequestHandler(getAccess: () => Access, getManagement: () => Management, options: Options = {}) {
  return async function handle(request: Request): Promise<Response> {
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const result = await getManagement().listTeam.execute(principal);
    if (result.status === "forbidden") return failure("forbidden", 403);
    if (result.status !== "found") return failure("service_unavailable", 503);
    return json({status: "found", team: result.team}, 200);
  };
}

export function createStaffInvitationRequestHandler(getAccess: () => Access, getManagement: () => Management, options: Options = {}) {
  return async function handle(request: Request): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const payload = await jsonPayload(request, ["displayName", "email", "targetRole"]);
    if (payload instanceof Response) return payload;
    const result = await getManagement().createInvitation.execute({principal, displayName: payload.displayName, email: payload.email, targetRole: payload.targetRole});
    if (result.status === "created") return json(result, 201);
    if (result.status === "validation_failed") return failure("invalid_request", 400, result.field);
    if (result.status === "forbidden") return failure("forbidden", 403);
    if (result.status === "invitation_conflict" || result.status === "email_conflict") return failure("conflict", 409);
    return failure("service_unavailable", 503);
  };
}

export function createStaffInvitationRevocationRequestHandler(getAccess: () => Access, getManagement: () => Management, options: Options = {}) {
  return async function handle(request: Request, context: IdContext<"invitationId">): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    let invitationId: string;
    try { invitationId = (await context.params).invitationId; } catch { return failure("invalid_request", 400); }
    return mutationStatus((await getManagement().revokeInvitation.execute({principal, invitationId})).status);
  };
}

export function createStaffRoleChangeRequestHandler(getAccess: () => Access, getManagement: () => Management, options: Options = {}) {
  return async function handle(request: Request, context: IdContext<"staffAccountId">): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const payload = await jsonPayload(request, ["role"]);
    if (payload instanceof Response) return payload;
    let staffAccountId: string;
    try { staffAccountId = (await context.params).staffAccountId; } catch { return failure("invalid_request", 400); }
    return mutationStatus((await getManagement().changeRole.execute({principal, targetStaffAccountId: staffAccountId, newRole: payload.role})).status);
  };
}

export function createStaffActiveChangeRequestHandler(active: boolean, getAccess: () => Access, getManagement: () => Management, options: Options = {}) {
  return async function handle(request: Request, context: IdContext<"staffAccountId">): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    let staffAccountId: string;
    try { staffAccountId = (await context.params).staffAccountId; } catch { return failure("invalid_request", 400); }
    return mutationStatus((await getManagement().setActive.execute({principal, targetStaffAccountId: staffAccountId, active})).status);
  };
}

export function createStaffActivationRequestHandler(getManagement: () => Management, options: Options = {}) {
  return async function handle(request: Request): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const payload = await jsonPayload(request, ["activationCode", "email", "password"]);
    if (payload instanceof Response) return payload;
    const result = await getManagement().activateInvitation.execute({email: payload.email, activationCode: payload.activationCode, password: payload.password});
    if (result.status === "activated") return json({status: "activated"}, 201);
    if (result.status === "validation_failed" && result.field === "password") return failure("invalid_password", 422, "password");
    if (result.status === "dependency_failed" || result.status === "persistence_failed") return failure("service_unavailable", 503);
    return failure("invitation_unavailable", 400);
  };
}
