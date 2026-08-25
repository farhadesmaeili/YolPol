import type {GetConversationMessageHistoryResult} from "@/features/inquiries/application/results/get-conversation-message-history-result";
import type {ReceiveCustomerMessageInput} from "@/features/inquiries/application/dto/customer-message-dto";
import type {ReceiveCustomerMessageResult} from "@/features/inquiries/application/results/receive-customer-message-result";
import type {ResolveConversationByAccessTokenResult} from "@/features/inquiries/application/results/resolve-conversation-by-access-token-result";
import type {InquiryRateLimiter} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";
import {originAllowed, readBoundedJsonBody} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";
import {parseCustomerMessagePayload} from "@/features/inquiries/infrastructure/validation/customer-message-payload";

type AccessResolver = Readonly<{execute(input: Readonly<{token: string}>): Promise<ResolveConversationByAccessTokenResult>}>;
type CustomerMessageReceiver = Readonly<{execute(input: ReceiveCustomerMessageInput): Promise<ReceiveCustomerMessageResult>}>;
type CustomerMessageHistory = Readonly<{execute(input: Readonly<{inquiryId: string}>): Promise<GetConversationMessageHistoryResult>}>;
type CustomerConversationRouteContext = Readonly<{params: Promise<Readonly<{token: string}>>}>;
type CustomerConversationHttpOptions = Readonly<{rateLimiter?: InquiryRateLimiter; approvedDevelopmentOrigins?: ReadonlySet<string>}>;
type ErrorCode = "conflict" | "invalid_origin" | "invalid_request" | "payload_too_large" | "rate_limited" | "service_unavailable" | "unauthorized" | "unsupported_media_type" | "validation_failed";

const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: ErrorCode, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);
const limited = (retryAfterSeconds: number) => Response.json({status: "error", code: "rate_limited"}, {status: 429, headers: {"Cache-Control": "no-store", "Retry-After": String(retryAfterSeconds)}});

type InquiryAccessResolution =
  | Readonly<{status: "resolved"; inquiryId: string}>
  | Readonly<{status: "invalid_request"}>
  | Readonly<{status: "unauthorized"}>
  | Readonly<{status: "service_unavailable"}>;

async function resolveInquiryId(getResolver: () => AccessResolver, context: CustomerConversationRouteContext): Promise<InquiryAccessResolution> {
  let token: string;
  try { ({token} = await context.params); }
  catch { return {status: "invalid_request"}; }
  let result: ResolveConversationByAccessTokenResult;
  try { result = await getResolver().execute({token}); }
  catch { return {status: "service_unavailable"}; }
  if (result.status === "resolved") return {status: "resolved", inquiryId: result.inquiryId};
  if (result.status === "unauthorized") return {status: "unauthorized"};
  return {status: "service_unavailable"};
}

export function createCustomerConversationMessageRequestHandler(getResolver: () => AccessResolver, getReceiver: () => CustomerMessageReceiver, options: CustomerConversationHttpOptions = {}) {
  return async function handle(request: Request, context: CustomerConversationRouteContext): Promise<Response> {
    if (!originAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") return failure("unsupported_media_type", 415);
    const decision = options.rateLimiter?.consume();
    if (decision && !decision.allowed) return limited(decision.retryAfterSeconds);
    const body = await readBoundedJsonBody(request);
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status === "invalid") return failure("invalid_request", 400);
    const parsed = parseCustomerMessagePayload(body.value);
    if (parsed.status === "failure") return failure("validation_failed", 422, parsed.field);

    const access = await resolveInquiryId(getResolver, context);
    if (access.status === "invalid_request") return failure("invalid_request", 400);
    if (access.status === "unauthorized") return failure("unauthorized", 401);
    if (access.status === "service_unavailable") return failure("service_unavailable", 503);

    let result: ReceiveCustomerMessageResult;
    try { result = await getReceiver().execute({inquiryId: access.inquiryId, message: parsed.value.message}); }
    catch { return failure("service_unavailable", 503); }
    switch (result.status) {
      case "created": return json({status: "created", messageId: result.messageId}, 201);
      case "validation_failed": return failure("validation_failed", 422, result.field);
      case "conflict": return failure("conflict", 409);
      case "conversation_not_found": return failure("unauthorized", 401);
      case "persistence_failed":
      case "dependency_failed": return failure("service_unavailable", 503);
    }
  };
}

export function createCustomerConversationHistoryRequestHandler(getResolver: () => AccessResolver, getHistory: () => CustomerMessageHistory, options: CustomerConversationHttpOptions = {}) {
  return async function handle(request: Request, context: CustomerConversationRouteContext): Promise<Response> {
    if (!originAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const decision = options.rateLimiter?.consume();
    if (decision && !decision.allowed) return limited(decision.retryAfterSeconds);

    const access = await resolveInquiryId(getResolver, context);
    if (access.status === "invalid_request") return failure("invalid_request", 400);
    if (access.status === "unauthorized") return failure("unauthorized", 401);
    if (access.status === "service_unavailable") return failure("service_unavailable", 503);

    let result: GetConversationMessageHistoryResult;
    try { result = await getHistory().execute({inquiryId: access.inquiryId}); }
    catch { return failure("service_unavailable", 503); }
    switch (result.status) {
      case "found": return json({messages: result.messages}, 200);
      case "conversation_not_found": return failure("unauthorized", 401);
      case "validation_failed":
      case "persistence_failed": return failure("service_unavailable", 503);
    }
  };
}
