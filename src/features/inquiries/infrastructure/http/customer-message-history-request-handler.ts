import type {GetConversationMessageHistoryResult} from "@/features/inquiries/application/results/get-conversation-message-history-result";
import type {InquiryRateLimiter} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";
import {originAllowed} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";

type CustomerMessageHistory = Readonly<{execute(input: Readonly<{inquiryId: string}>): Promise<GetConversationMessageHistoryResult>}>;
type CustomerMessageRouteContext = Readonly<{params: Promise<Readonly<{inquiryId: string}>>}>;
type ErrorCode = "conversation_not_found" | "invalid_origin" | "invalid_request" | "rate_limited" | "service_unavailable" | "validation_failed";
type CustomerMessageHistoryHttpOptions = Readonly<{rateLimiter?: InquiryRateLimiter; approvedDevelopmentOrigins?: ReadonlySet<string>}>;

const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: ErrorCode, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);

export function createCustomerMessageHistoryRequestHandler(getHistory: () => CustomerMessageHistory, options: CustomerMessageHistoryHttpOptions = {}) {
  return async function handle(request: Request, context: CustomerMessageRouteContext): Promise<Response> {
    if (!originAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const decision = options.rateLimiter?.consume();
    if (decision && !decision.allowed) return Response.json({status: "error", code: "rate_limited"}, {status: 429, headers: {"Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds)}});

    let inquiryId: string;
    try { ({inquiryId} = await context.params); }
    catch { return failure("invalid_request", 400); }

    let result: GetConversationMessageHistoryResult;
    try { result = await getHistory().execute({inquiryId}); }
    catch { return failure("service_unavailable", 503); }
    switch (result.status) {
      case "found": return json({messages: result.messages}, 200);
      case "conversation_not_found": return failure("conversation_not_found", 404);
      case "validation_failed": return failure("validation_failed", 422, result.field);
      case "persistence_failed": return failure("service_unavailable", 503);
    }
  };
}
