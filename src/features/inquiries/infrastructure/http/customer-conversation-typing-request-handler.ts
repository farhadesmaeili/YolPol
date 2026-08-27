import type {ResolveConversationByAccessTokenResult} from "@/features/inquiries/application/results/resolve-conversation-by-access-token-result";
import type {UpdateConversationTypingResult} from "@/features/inquiries/application/results/update-conversation-typing-result";
import type {ConversationTypingRateLimiter} from "@/features/inquiries/infrastructure/http/conversation-typing-rate-limiter";
import {readCustomerConversationCookie, type CustomerConversationCookieEnvironment} from "@/features/inquiries/infrastructure/http/customer-conversation-cookie";
import {parseConversationTypingPayload} from "@/features/inquiries/infrastructure/validation/conversation-typing-payload";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {strictOriginAllowed} from "@/shared/infrastructure/http/strict-origin";

export const conversationTypingRequestSizeLimit = 1_024;

type AccessResolver = Readonly<{execute(input: Readonly<{token: string}>): Promise<ResolveConversationByAccessTokenResult>}>;
type TypingUpdater = Readonly<{execute(input: Readonly<{
  conversationId: string;
  participant: "CUSTOMER";
  actorKey: string;
  isTyping: boolean;
}>): UpdateConversationTypingResult}>;
type RouteContext = Readonly<{params: Promise<Readonly<{token: string}>>}>;
type Options = Readonly<{approvedDevelopmentOrigins?: ReadonlySet<string>; rateLimiter?: ConversationTypingRateLimiter}>;
type ErrorCode = "invalid_origin" | "invalid_request" | "payload_too_large" | "rate_limited" | "service_unavailable" | "unauthorized" | "unsupported_media_type";

const customerActorKey = "customer";
const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: ErrorCode, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);

export function createCustomerConversationTypingRequestHandler(
  getResolver: () => AccessResolver,
  getUpdater: () => TypingUpdater,
  options: Options = {},
) {
  return async function handle(request: Request, context: RouteContext): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
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

    const body = await readJsonBodyWithinLimit(request, conversationTypingRequestSizeLimit, "Conversation typing request body exceeds limit.");
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status === "invalid") return failure("invalid_request", 400, "request");
    const parsed = parseConversationTypingPayload(body.value);
    if (parsed.status === "failure") return failure("invalid_request", 400, parsed.field);

    let token: string;
    try { ({token} = await context.params); }
    catch { return failure("invalid_request", 400, "token"); }
    let access: ResolveConversationByAccessTokenResult;
    try { access = await getResolver().execute({token}); }
    catch { return failure("service_unavailable", 503); }
    if (access.status === "unauthorized") return failure("unauthorized", 401);
    if (access.status !== "resolved") return failure("service_unavailable", 503);

    let result: UpdateConversationTypingResult;
    try {
      result = getUpdater().execute({conversationId: access.conversationId, participant: "CUSTOMER", actorKey: customerActorKey, isTyping: parsed.value.isTyping});
    } catch {
      return failure("service_unavailable", 503);
    }
    if (result.status === "validation_failed") return failure("invalid_request", 400);
    if (result.status !== "updated") return failure("service_unavailable", 503);
    return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
  };
}

export function createCustomerResumeTypingRequestHandler(
  getResolver: () => AccessResolver,
  getUpdater: () => TypingUpdater,
  options: Options = {},
  environment: CustomerConversationCookieEnvironment = process.env,
) {
  const handleTokenRequest = createCustomerConversationTypingRequestHandler(getResolver, getUpdater, options);
  return async function handle(request: Request): Promise<Response> {
    if (!strictOriginAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const token = readCustomerConversationCookie(request, environment);
    if (!token) return failure("unauthorized", 401);
    return handleTokenRequest(request, {params: Promise.resolve({token})});
  };
}
