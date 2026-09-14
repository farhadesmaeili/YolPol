import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import type {
  CreateTelegramGroupConnectionRequest,
  ListNotificationDestinations,
  RevokeTelegramGroupConnectionRequest,
  SetTeamMemberNotifications,
  SetTelegramGroupDestination,
} from "@/features/notification-destinations/application/use-cases/notification-destination-use-cases";
import type {NotificationDestinationRateLimiter} from "@/features/notification-destinations/infrastructure/http/notification-destination-rate-limiter";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";
import {buildTelegramStartGroupDeepLink} from "@/shared/config/telegram-bot";

export const notificationDestinationRequestSizeLimit = 4 * 1_024;
type Environment = Readonly<{NODE_ENV?: string}>;
type Access = Readonly<{resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>}>;
type Operations = Readonly<{
  list: Pick<ListNotificationDestinations, "execute">;
  setTeamMember: Pick<SetTeamMemberNotifications, "execute">;
  createGroupRequest: Pick<CreateTelegramGroupConnectionRequest, "execute">;
  revokeGroupRequest: Pick<RevokeTelegramGroupConnectionRequest, "execute">;
  setGroup: Pick<SetTelegramGroupDestination, "execute">;
}>;
type Options = Readonly<{
  approvedDevelopmentOrigins?: ReadonlySet<string>;
  environment?: Environment;
  rateLimiter: Pick<NotificationDestinationRateLimiter, "consume">;
}>;

const json = (body: Readonly<Record<string, unknown>>, status: number, headers?: HeadersInit) => Response.json(body, {status, headers: {"Cache-Control": "no-store", ...headers}});
const failure = (code: string, status: number, headers?: HeadersInit) => json({status: "error", code}, status, headers);

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

function rejectsQuery(request: Request): boolean { try { return new URL(request.url).search.length > 0; } catch { return true; } }
function plainRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype ? value as Record<string, unknown> : null;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).sort().join(",") === [...keys].sort().join(","); }

export function createGetNotificationDestinationsHandler(getAccess: () => Access, getOperations: () => Operations, options: Options) {
  return async function handle(request: Request): Promise<Response> {
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    const result = await getOperations().list.execute(principal);
    if (result.status === "found") return json({status: "found", value: result.value}, 200);
    return failure(result.status === "forbidden" ? "forbidden" : "service_unavailable", result.status === "forbidden" ? 403 : 503);
  };
}

export function createMutateNotificationDestinationsHandler(
  getAccess: () => Access,
  getOperations: () => Operations,
  getBotUsername: () => string,
  options: Options,
) {
  return async function handle(request: Request): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    if (rejectsQuery(request)) return failure("invalid_request", 400);
    const principal = await authenticate(request, getAccess, options);
    if (principal instanceof Response) return principal;
    const rateLimit = options.rateLimiter.consume();
    if (!rateLimit.allowed) return failure("rate_limited", 429, {"Retry-After": String(rateLimit.retryAfterSeconds)});
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return failure("unsupported_media_type", 415);
    const body = await readJsonBodyWithinLimit(request, notificationDestinationRequestSizeLimit, "Notification destination request body exceeds limit.");
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status !== "success") return failure("invalid_request", 400);
    const command = plainRecord(body.value);
    if (!command || typeof command.operation !== "string") return failure("invalid_request", 400);
    let result: Readonly<{status: string; connectionToken?: string; expiresAt?: string}>;
    switch (command.operation) {
      case "ENABLE_TEAM_MEMBER":
      case "DISABLE_TEAM_MEMBER":
        if (!exactKeys(command, ["operation", "staffAccountId"])) return failure("invalid_request", 400);
        result = await getOperations().setTeamMember.execute({principal, targetStaffAccountId: command.staffAccountId, enabled: command.operation === "ENABLE_TEAM_MEMBER"});
        break;
      case "CREATE_GROUP_REQUEST":
        if (!exactKeys(command, ["operation"])) return failure("invalid_request", 400);
        let botUsername: string;
        try { botUsername = getBotUsername(); } catch { return failure("service_unavailable", 503); }
        result = await getOperations().createGroupRequest.execute({principal});
        if (result.status === "created" && result.connectionToken && result.expiresAt) {
          try { return json({status: "created", deepLink: buildTelegramStartGroupDeepLink(botUsername, result.connectionToken), expiresAt: result.expiresAt}, 201); }
          catch { return failure("service_unavailable", 503); }
        }
        break;
      case "REVOKE_GROUP_REQUEST":
        if (!exactKeys(command, ["operation"])) return failure("invalid_request", 400);
        result = await getOperations().revokeGroupRequest.execute({principal});
        break;
      case "ENABLE_GROUP":
      case "DISABLE_GROUP":
      case "DISCONNECT_GROUP":
        if (!exactKeys(command, ["operation", "recipientId"])) return failure("invalid_request", 400);
        result = await getOperations().setGroup.execute({principal, recipientId: command.recipientId,
          operation: command.operation === "ENABLE_GROUP" ? "ENABLE" : command.operation === "DISABLE_GROUP" ? "DISABLE" : "DISCONNECT"});
        break;
      default: return failure("invalid_request", 400);
    }
    if (result.status === "changed" || result.status === "unchanged" || result.status === "revoked") return json({status: result.status}, 200);
    if (result.status === "forbidden") return failure("forbidden", 403);
    if (result.status === "validation_failed") return failure("invalid_request", 400);
    if (result.status === "telegram_not_linked") return failure("telegram_not_linked", 409);
    return failure("unavailable", 409);
  };
}
