import type {ReceiveCustomerMessageInput} from "@/features/inquiries/application/dto/customer-message-dto";
import type {ReceiveCustomerMessageResult} from "@/features/inquiries/application/results/receive-customer-message-result";
import type {InquiryRateLimiter} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";
import {originAllowed, readBoundedJsonBody} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";
import {parseCustomerMessagePayload} from "@/features/inquiries/infrastructure/validation/customer-message-payload";

type CustomerMessageReceiver = Readonly<{execute(input: ReceiveCustomerMessageInput): Promise<ReceiveCustomerMessageResult>}>;
type CustomerMessageRouteContext = Readonly<{params: Promise<Readonly<{inquiryId: string}>>}>;
type ErrorCode = "conflict" | "conversation_not_found" | "invalid_origin" | "invalid_request" | "payload_too_large" | "rate_limited" | "service_unavailable" | "unsupported_media_type" | "validation_failed";
type CustomerMessageHttpOptions = Readonly<{rateLimiter?: InquiryRateLimiter; approvedDevelopmentOrigins?: ReadonlySet<string>}>;

const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
const failure = (code: ErrorCode, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);

export function createCustomerMessageRequestHandler(getReceiver: () => CustomerMessageReceiver, options: CustomerMessageHttpOptions = {}) {
  return async function handle(request: Request, context: CustomerMessageRouteContext): Promise<Response> {
    if (!originAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") return failure("unsupported_media_type", 415);
    const decision = options.rateLimiter?.consume();
    if (decision && !decision.allowed) return Response.json({status: "error", code: "rate_limited"}, {status: 429, headers: {"Cache-Control": "no-store", "Retry-After": String(decision.retryAfterSeconds)}});

    const body = await readBoundedJsonBody(request);
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status === "invalid") return failure("invalid_request", 400);
    const parsed = parseCustomerMessagePayload(body.value);
    if (parsed.status === "failure") return failure("validation_failed", 422, parsed.field);

    let inquiryId: string;
    try { ({inquiryId} = await context.params); }
    catch { return failure("invalid_request", 400); }

    let result: ReceiveCustomerMessageResult;
    try { result = await getReceiver().execute({inquiryId, message: parsed.value.message}); }
    catch { return failure("service_unavailable", 503); }
    switch (result.status) {
      case "created": return json({status: "created", messageId: result.messageId}, 201);
      case "conversation_not_found": return failure("conversation_not_found", 404);
      case "validation_failed": return failure("validation_failed", 422, result.field);
      case "conflict": return failure("conflict", 409);
      case "persistence_failed":
      case "dependency_failed": return failure("service_unavailable", 503);
    }
  };
}
