import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import type {TelegramConnectionStateDto} from "@/features/telegram-staff-onboarding/application/dto/telegram-connection-dto";
import type {CreateOwnTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/create-own-telegram-connection-request";
import type {DisconnectOwnTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/disconnect-own-telegram";
import type {ForceDisconnectStaffTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/force-disconnect-staff-telegram";
import type {GetOwnTelegramConnection} from "@/features/telegram-staff-onboarding/application/use-cases/get-own-telegram-connection";
import type {RevokeOwnTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/revoke-own-telegram-connection-request";
import type {RevokeStaffTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/revoke-staff-telegram-connection-request";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {presentTelegramConnection} from "@/features/telegram-staff-onboarding/presentation/view-models/telegram-connection-view-model";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";
import {buildTelegramStartDeepLink} from "@/shared/config/telegram-bot";

export const telegramStaffRequestSizeLimit = 1_024;

type Environment = Readonly<{NODE_ENV?: string}>;
type Options = Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; environment?: Environment}>;
type Access = Readonly<{resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>}>;
type Onboarding = Readonly<{
  getOwnConnection: Pick<GetOwnTelegramConnection, "execute">;
  createOwnConnectionRequest: Pick<CreateOwnTelegramConnectionRequest, "execute">;
  disconnectOwn: Pick<DisconnectOwnTelegram, "execute">;
  forceDisconnectStaff: Pick<ForceDisconnectStaffTelegram, "execute">;
  revokeOwnConnectionRequest: Pick<RevokeOwnTelegramConnectionRequest, "execute">;
  revokeStaffConnectionRequest: Pick<RevokeStaffTelegramConnectionRequest, "execute">;
}>;
type IdContext = Readonly<{params: Promise<{staffAccountId: string}>}>;

const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: string, status: number) => json({status: "error", code}, status);

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

async function acceptsEmptyJson(request: Request): Promise<boolean | Response> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return failure("unsupported_media_type", 415);
  const body = await readJsonBodyWithinLimit(request, telegramStaffRequestSizeLimit, "Telegram Staff request body exceeds limit.");
  if (body.status === "too_large") return failure("payload_too_large", 413);
  if (body.status === "invalid") return failure("invalid_request", 400);
  const value = body.value;
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 0
    ? true
    : failure("invalid_request", 400);
}

async function prepareMutation(request: Request, getAccess: () => Access, options: Options): Promise<StaffPrincipal | Response> {
  if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
  const principal = await authenticate(request, getAccess, options);
  if (principal instanceof Response) return principal;
  if (rejectsQuery(request)) return failure("invalid_request", 400);
  const body = await acceptsEmptyJson(request);
  return body instanceof Response ? body : principal;
}

function safeConnectionState(state: Exclude<TelegramConnectionStateDto, Readonly<{status: "unavailable"}>>) {
  return presentTelegramConnection(state);
}

export function createOwnTelegramConnectionStateRequestHandler(getAccess: () => Access, getOnboarding: () => Onboarding, options: Options = {}) {
  return async function handle(request: Request): Promise<Response> {
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const result = await getOnboarding().getOwnConnection.execute({principal});
    if (result.status === "unavailable") return failure("service_unavailable", 503);
    return json({status: "found", connection: safeConnectionState(result)}, 200);
  };
}

export function createOwnTelegramConnectionRequestHandler(
  getAccess: () => Access,
  getOnboarding: () => Onboarding,
  getBotUsername: () => string,
  options: Options = {},
) {
  return async function handle(request: Request): Promise<Response> {
    const principal = await prepareMutation(request, getAccess, options);
    if (principal instanceof Response) return principal;
    let botUsername: string;
    try { botUsername = getBotUsername(); } catch { return failure("service_unavailable", 503); }
    const result = await getOnboarding().createOwnConnectionRequest.execute({principal});
    if (result.status !== "created") return failure("service_unavailable", 503);
    try {
      return json({
        status: "created",
        connectionToken: result.connectionToken,
        deepLink: buildTelegramStartDeepLink(botUsername, result.connectionToken),
        expiresAt: result.expiresAt,
      }, 201);
    } catch { return failure("service_unavailable", 503); }
  };
}

function ownMutation(
  operation: "disconnectOwn" | "revokeOwnConnectionRequest",
  success: "disconnected" | "revoked",
  getAccess: () => Access,
  getOnboarding: () => Onboarding,
  options: Options,
) {
  return async function handle(request: Request): Promise<Response> {
    const principal = await prepareMutation(request, getAccess, options);
    if (principal instanceof Response) return principal;
    const result = await getOnboarding()[operation].execute({principal});
    return result.status === success ? json({status: success}, 200) : failure("unavailable", 409);
  };
}

export const createDisconnectOwnTelegramRequestHandler = (getAccess: () => Access, getOnboarding: () => Onboarding, options: Options = {}) => ownMutation("disconnectOwn", "disconnected", getAccess, getOnboarding, options);
export const createRevokeOwnTelegramRequestHandler = (getAccess: () => Access, getOnboarding: () => Onboarding, options: Options = {}) => ownMutation("revokeOwnConnectionRequest", "revoked", getAccess, getOnboarding, options);

function managerMutation(
  operation: "forceDisconnectStaff" | "revokeStaffConnectionRequest",
  success: "disconnected" | "revoked",
  getAccess: () => Access,
  getOnboarding: () => Onboarding,
  options: Options,
) {
  return async function handle(request: Request, context: IdContext): Promise<Response> {
    const principal = await prepareMutation(request, getAccess, options);
    if (principal instanceof Response) return principal;
    let targetStaffAccountId: string;
    try { targetStaffAccountId = (await context.params).staffAccountId; } catch { return failure("invalid_request", 400); }
    const result = await getOnboarding()[operation].execute({principal, targetStaffAccountId});
    return result.status === success ? json({status: success}, 200) : failure("unavailable", 409);
  };
}

export const createForceDisconnectStaffTelegramRequestHandler = (getAccess: () => Access, getOnboarding: () => Onboarding, options: Options = {}) => managerMutation("forceDisconnectStaff", "disconnected", getAccess, getOnboarding, options);
export const createRevokeStaffTelegramRequestHandler = (getAccess: () => Access, getOnboarding: () => Onboarding, options: Options = {}) => managerMutation("revokeStaffConnectionRequest", "revoked", getAccess, getOnboarding, options);
