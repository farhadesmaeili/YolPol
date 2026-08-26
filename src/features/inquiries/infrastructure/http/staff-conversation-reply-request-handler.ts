import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import type {SendStaffConversationReplyInput} from "@/features/inquiries/application/dto/staff-conversation-reply-dto";
import type {SendStaffConversationReplyResult} from "@/features/inquiries/application/results/send-staff-conversation-reply-result";
import type {StaffConversationReplyRateLimiter} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-rate-limiter";
import {parseStaffConversationReplyPayload} from "@/features/inquiries/infrastructure/validation/staff-conversation-reply-payload";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

export const staffConversationReplyRequestSizeLimit = 32 * 1_024;

type StaffSessionResolver = Readonly<{
  execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>;
}>;

type StaffReplyAuthorization = Readonly<{
  mayReplyToCustomerConversation(principal: StaffPrincipal): boolean;
  actorReferenceFor(principal: StaffPrincipal): string;
}>;

type StaffReplyAccess = Readonly<{
  resolveSession: StaffSessionResolver;
  authorization: StaffReplyAuthorization;
}>;

type StaffReplySender = Readonly<{
  execute(input: SendStaffConversationReplyInput): Promise<SendStaffConversationReplyResult>;
}>;

type Environment = Readonly<{NODE_ENV?: string}>;
type StaffConversationReplyHttpOptions = Readonly<{
  approvedDevelopmentOrigins?: ReadonlySet<string>;
  environment?: Environment;
  rateLimiter?: StaffConversationReplyRateLimiter;
}>;
type RouteContext = Readonly<{params: Promise<Readonly<{inquiryId: string}>>}>;

type ErrorCode =
  | "conflict"
  | "forbidden"
  | "invalid_origin"
  | "invalid_request"
  | "not_found"
  | "payload_too_large"
  | "rate_limited"
  | "service_unavailable"
  | "unauthorized"
  | "unsupported_media_type";

function json(body: Readonly<Record<string, unknown>>, status: number): Response {
  return Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
}

function failure(code: ErrorCode, status: number, field?: string): Response {
  return json({status: "error", code, ...(field ? {field} : {})}, status);
}

export function createStaffConversationReplyRequestHandler(
  getAccess: () => StaffReplyAccess,
  getSender: () => StaffReplySender,
  options: StaffConversationReplyHttpOptions = {},
) {
  return async function handle(request: Request, context: RouteContext): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);

    const credential = readStaffSessionCookie(request, options.environment);
    if (!credential) return failure("unauthorized", 401);

    let access: StaffReplyAccess;
    let principal: StaffPrincipal;
    try {
      access = getAccess();
      const result = await access.resolveSession.execute({sessionCredential: credential});
      if (result.status === "unauthorized") return failure("unauthorized", 401);
      if (result.status !== "authenticated") return failure("service_unavailable", 503);
      principal = result.principal;
    } catch {
      return failure("service_unavailable", 503);
    }

    let actorReference: string;
    try {
      if (!access.authorization.mayReplyToCustomerConversation(principal)) return failure("forbidden", 403);
      actorReference = access.authorization.actorReferenceFor(principal);
    } catch {
      return failure("service_unavailable", 503);
    }

    let requestUrl: URL;
    try { requestUrl = new URL(request.url); }
    catch { return failure("invalid_request", 400, "request"); }
    if (requestUrl.search.length > 0) return failure("invalid_request", 400, "query");

    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") return failure("unsupported_media_type", 415);

    const decision = options.rateLimiter?.consume();
    if (decision && !decision.allowed) {
      return Response.json({status: "error", code: "rate_limited"}, {
        status: 429,
        headers: {"Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds)},
      });
    }

    const requestBody = await readJsonBodyWithinLimit(
      request,
      staffConversationReplyRequestSizeLimit,
      "Staff conversation reply request body exceeds limit.",
    );
    if (requestBody.status === "too_large") return failure("payload_too_large", 413);
    if (requestBody.status === "invalid") return failure("invalid_request", 400, "request");
    const parsed = parseStaffConversationReplyPayload(requestBody.value);
    if (parsed.status === "failure") return failure("invalid_request", 400, parsed.field);

    let inquiryId: string;
    try { inquiryId = (await context.params).inquiryId; }
    catch { return failure("invalid_request", 400, "inquiryId"); }

    let result: SendStaffConversationReplyResult;
    try { result = await getSender().execute({...parsed.value, inquiryId, actorReference}); }
    catch { return failure("service_unavailable", 503); }

    switch (result.status) {
      case "sent": return json({status: "sent", message: result.message}, result.idempotent ? 200 : 201);
      case "inquiry_not_found":
      case "conversation_not_found": return failure("not_found", 404);
      case "validation_failed": return failure("invalid_request", 400, result.field);
      case "conflict": return failure("conflict", 409);
      case "persistence_failed":
      case "dependency_failed": return failure("service_unavailable", 503);
    }
  };
}
