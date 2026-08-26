import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {readStaffSessionCookie} from "@/features/staff-authentication/infrastructure/http/staff-session-cookie";
import type {ResolveConversationForInquiryResult} from "@/features/inquiries/application/results/resolve-conversation-for-inquiry-result";
import type {UpdateConversationTypingResult} from "@/features/inquiries/application/results/update-conversation-typing-result";
import type {ConversationTypingRateLimiter} from "@/features/inquiries/infrastructure/http/conversation-typing-rate-limiter";
import {conversationTypingRequestSizeLimit} from "@/features/inquiries/infrastructure/http/customer-conversation-typing-request-handler";
import {parseConversationTypingPayload} from "@/features/inquiries/infrastructure/validation/conversation-typing-payload";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

type StaffAccess = Readonly<{
  resolveSession: Readonly<{execute(input: Readonly<{sessionCredential: string}>): Promise<ResolveStaffSessionResult>}>;
  authorization: Readonly<{mayReplyToCustomerConversation(principal: StaffPrincipal): boolean}>;
}>;
type ConversationResolver = Readonly<{execute(input: Readonly<{inquiryId: string}>): Promise<ResolveConversationForInquiryResult>}>;
type TypingUpdater = Readonly<{execute(input: Readonly<{
  conversationId: string;
  participant: "STAFF";
  actorKey: string;
  isTyping: boolean;
}>): UpdateConversationTypingResult}>;
type Environment = Readonly<{NODE_ENV?: string}>;
type Options = Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; environment?: Environment; rateLimiter?: ConversationTypingRateLimiter}>;
type RouteContext = Readonly<{params: Promise<Readonly<{inquiryId: string}>>}>;
type ErrorCode = "forbidden" | "invalid_origin" | "invalid_request" | "not_found" | "payload_too_large" | "rate_limited" | "service_unavailable" | "unauthorized" | "unsupported_media_type";

const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: ErrorCode, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);

export function createStaffConversationTypingRequestHandler(
  getAccess: () => StaffAccess,
  getConversation: () => ConversationResolver,
  getUpdater: () => TypingUpdater,
  options: Options = {},
) {
  return async function handle(request: Request, context: RouteContext): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const credential = readStaffSessionCookie(request, options.environment);
    if (!credential) return failure("unauthorized", 401);

    let principal: StaffPrincipal;
    try {
      const access = getAccess();
      const session = await access.resolveSession.execute({sessionCredential: credential});
      if (session.status === "unauthorized") return failure("unauthorized", 401);
      if (session.status !== "authenticated") return failure("service_unavailable", 503);
      principal = session.principal;
      if (!access.authorization.mayReplyToCustomerConversation(principal)) return failure("forbidden", 403);
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
      return Response.json({status: "error", code: "rate_limited"}, {status: 429, headers: {"Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds)}});
    }

    const body = await readJsonBodyWithinLimit(request, conversationTypingRequestSizeLimit, "Staff typing request body exceeds limit.");
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status === "invalid") return failure("invalid_request", 400, "request");
    const parsed = parseConversationTypingPayload(body.value);
    if (parsed.status === "failure") return failure("invalid_request", 400, parsed.field);

    let inquiryId: string;
    try { inquiryId = (await context.params).inquiryId; }
    catch { return failure("invalid_request", 400, "inquiryId"); }
    let conversation: ResolveConversationForInquiryResult;
    try { conversation = await getConversation().execute({inquiryId}); }
    catch { return failure("service_unavailable", 503); }
    if (conversation.status === "validation_failed") return failure("invalid_request", 400, "inquiryId");
    if (conversation.status === "conversation_not_found") return failure("not_found", 404);
    if (conversation.status !== "resolved") return failure("service_unavailable", 503);

    let result: UpdateConversationTypingResult;
    try {
      result = getUpdater().execute({conversationId: conversation.conversationId, participant: "STAFF", actorKey: principal.teamMemberId, isTyping: parsed.value.isTyping});
    } catch {
      return failure("service_unavailable", 503);
    }
    if (result.status === "validation_failed") return failure("invalid_request", 400);
    if (result.status !== "updated") return failure("service_unavailable", 503);
    return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
  };
}
