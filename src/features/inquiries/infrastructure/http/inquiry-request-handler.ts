import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import type {SubmitInquiryResult} from "@/features/inquiries/application/results/submit-inquiry-result";
import {parseSubmissionPayload} from "@/features/inquiries/infrastructure/validation/submission-payload";
import type {InquiryRateLimiter} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";
import {originAllowed} from "@/shared/infrastructure/http/strict-origin";
import {serializeCustomerConversationCookie, type CustomerConversationCookieEnvironment} from "@/features/inquiries/infrastructure/http/customer-conversation-cookie";

export {originAllowed} from "@/shared/infrastructure/http/strict-origin";

export const inquiryRequestSizeLimit = 32 * 1024;

type InquirySubmission = Readonly<{execute(input: SubmitInquiryInput): Promise<SubmitInquiryResult>}>;
type ErrorCode = "invalid_request" | "invalid_origin" | "payload_too_large" | "unsupported_media_type" | "validation_failed" | "product_unavailable" | "conflict" | "rate_limited" | "service_unavailable";

const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});

const failure = (code: ErrorCode, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);

type BodyReadResult = Readonly<{status: "success"; value: unknown}> | Readonly<{status: "invalid"}> | Readonly<{status: "too_large"}>;

export async function readBoundedJsonBody(request: Request): Promise<BodyReadResult> {
  return readJsonBodyWithinLimit(request, inquiryRequestSizeLimit, "Inquiry request body exceeds limit.");
}

export function createInquiryRequestHandler(getSubmission: () => InquirySubmission, options: Readonly<{rateLimiter?: InquiryRateLimiter; approvedDevelopmentOrigins?: ReadonlySet<string>; environment?: CustomerConversationCookieEnvironment}> = {}) {
  return async function handle(request: Request): Promise<Response> {
    if (!originAllowed(request, options.approvedDevelopmentOrigins)) return failure("invalid_origin", 403);
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") return failure("unsupported_media_type", 415);
    const decision = options.rateLimiter?.consume();
    if (decision && !decision.allowed) return Response.json({status:"error",code:"rate_limited"}, {status:429,headers:{"Cache-Control":"no-store","Retry-After":String(decision.retryAfterSeconds)}});
    const body = await readBoundedJsonBody(request);
    if (body.status === "too_large") return failure("payload_too_large", 413);
    if (body.status === "invalid") return failure("invalid_request", 400);
    const parsed = parseSubmissionPayload(body.value);
    if (parsed.status === "failure") return failure("validation_failed", 422, parsed.issues[0]?.field);

    let result: SubmitInquiryResult;
    try { result = await getSubmission().execute(parsed.value); } catch { return failure("service_unavailable", 503); }
    switch (result.status) {
      case "accepted":
      case "accepted_with_notification_failures": {
        const expiresAt = new Date(result.conversationAccessExpiresAt);
        let cookie: string;
        try { cookie = serializeCustomerConversationCookie(result.conversationAccessToken, expiresAt, options.environment); }
        catch { return failure("service_unavailable", 503); }
        return Response.json(
          {status: "created", inquiryId: result.inquiry.inquiryId},
          {status: 201, headers: {"Cache-Control": "no-store", "Set-Cookie": cookie}},
        );
      }
      case "validation_failed": return failure("validation_failed", 422, result.field);
      case "product_not_found":
      case "product_unavailable":
      case "locale_not_available": return failure("product_unavailable", 422, `items.${parsed.value.items.findIndex(({productId}) => productId === result.productId)}.productId`);
      case "duplicate_inquiry": return failure("conflict", 409);
      case "persistence_failed":
      case "dependency_failed": return failure("service_unavailable", 503);
    }
  };
}
