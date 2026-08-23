import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import type {SubmitInquiryResult} from "@/features/inquiries/application/results/submit-inquiry-result";
import {parseSubmissionPayload} from "@/features/inquiries/infrastructure/validation/submission-payload";
import {siteConfig} from "@/shared/config/site";
import type {InquiryRateLimiter} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";

export const inquiryRequestSizeLimit = 32 * 1024;

type InquirySubmission = Readonly<{execute(input: SubmitInquiryInput): Promise<SubmitInquiryResult>}>;
type ErrorCode = "invalid_request" | "invalid_origin" | "payload_too_large" | "unsupported_media_type" | "validation_failed" | "product_unavailable" | "conflict" | "rate_limited" | "service_unavailable";

const json = (body: Readonly<Record<string, unknown>>, status: number) => Response.json(body, {status, headers: {"Cache-Control": "no-store"}});

export function originAllowed(request: Request, approvedDevelopmentOrigins: ReadonlySet<string> = new Set()): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let normalizedOrigin: string;
  let originUrl: URL;
  try { originUrl = new URL(origin); normalizedOrigin = originUrl.origin; } catch { return false; }
  if (origin !== normalizedOrigin) return false;
  if (normalizedOrigin === siteConfig.url) return true;
  if (process.env.NODE_ENV !== "development") return false;
  if (approvedDevelopmentOrigins.has(normalizedOrigin)) return true;
  const requestUrl = new URL(request.url);
  const requestHost = request.headers.get("host") ?? requestUrl.host;
  return (originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1" || originUrl.hostname === "[::1]") && originUrl.protocol === requestUrl.protocol && originUrl.host === requestHost;
}

const failure = (code: ErrorCode, status: number, field?: string) => json({status: "error", code, ...(field ? {field} : {})}, status);

type BodyReadResult = Readonly<{status: "success"; value: unknown}> | Readonly<{status: "invalid"}> | Readonly<{status: "too_large"}>;

export async function readBoundedJsonBody(request: Request): Promise<BodyReadResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declared)) return {status: "invalid"};
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes)) return {status: "invalid"};
    if (declaredBytes > inquiryRequestSizeLimit) return {status: "too_large"};
  }
  if (!request.body) return {status: "invalid"};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > inquiryRequestSizeLimit) {
        try { await reader.cancel("Inquiry request body exceeds limit."); } catch { /* The 413 response remains authoritative. */ }
        return {status: "too_large"};
      }
      chunks.push(value);
    }
  } catch { return {status: "invalid"}; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let text: string;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(bytes); } catch { return {status: "invalid"}; }
  try { return {status: "success", value: JSON.parse(text)}; } catch { return {status: "invalid"}; }
}

export function createInquiryRequestHandler(getSubmission: () => InquirySubmission, options: Readonly<{rateLimiter?: InquiryRateLimiter; approvedDevelopmentOrigins?: ReadonlySet<string>}> = {}) {
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
      case "accepted_with_notification_failures":
        return json({status: "created", inquiryId: result.inquiry.inquiryId}, 201);
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
