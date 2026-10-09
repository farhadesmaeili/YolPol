import {createHash, timingSafeEqual} from "node:crypto";
import type {CustomerAcquisition} from "@/features/customer-acquisition/application/use-cases/customer-acquisition";
import {AcquisitionConflictError, AcquisitionNotFoundError, AcquisitionValidationError, type AcquisitionResult} from "@/features/customer-acquisition/domain/types/acquisition-types";
import {parseObservation, parseQualification, parseRelease, parseSuppression} from "@/features/customer-acquisition/infrastructure/validation/acquisition-input";
import {FixedWindowRateLimiter} from "@/shared/infrastructure/http/fixed-window-rate-limiter";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";

export const acquisitionBodyLimit = 8192;
export function createAcquisitionHandler(input: Readonly<{
  application: CustomerAcquisition; token: string; requestId(): string;
  present(result: AcquisitionResult, requestId: string): unknown;
  log(fields: Readonly<{requestId: string; status: number; durationMs: number}>): void;
  limiter?: FixedWindowRateLimiter;
}>) {
  const expected = createHash("sha256").update(`Bearer ${input.token}`).digest();
  const limiter = input.limiter ?? new FixedWindowRateLimiter({maxRequests: 60, windowMs: 60000});
  return async (request: Request): Promise<Response> => {
    const requestId = input.requestId();
    const started = Date.now();
    const respond = (status: number, body: unknown) => {
      input.log({requestId, status, durationMs: Date.now() - started});
      return Response.json(body, {status, headers: {"cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId}});
    };
    const error = (status: number, code: string) => respond(status, {requestId, error: code});
    try {
      const path = new URL(request.url).pathname;
      // Container-local health probes carry no business data or credentials.
      if (request.method === "GET" && path === "/health/live") return respond(200, {status: "ok"});
      if (request.method === "GET" && path === "/health/ready") return await input.application.ready() ? respond(200, {status: "ok"}) : error(503, "NOT_READY");
      if (!limiter.consume().allowed) return error(429, "RATE_LIMITED");
      const authorization = request.headers.get("authorization") ?? "";
      if (authorization.length > 128 || !timingSafeEqual(expected, createHash("sha256").update(authorization).digest())) return error(401, "UNAUTHORIZED");
      if (request.method !== "POST") return error(405, "METHOD_NOT_ALLOWED");
      if (!["/v1/observations", "/v1/qualifications", "/v1/suppressions", "/v1/suppressions/release"].includes(path)) return error(404, "NOT_FOUND");
      if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")) return error(415, "UNSUPPORTED_MEDIA_TYPE");
      const body = await readJsonBodyWithinLimit(request, acquisitionBodyLimit);
      if (body.status === "too_large") return error(413, "BODY_TOO_LARGE");
      if (body.status !== "success") return error(400, "INVALID_REQUEST");
      let result: AcquisitionResult;
      switch (path) {
        case "/v1/observations": result = await input.application.ingest(parseObservation(body.value)); break;
        case "/v1/qualifications": result = await input.application.qualify(parseQualification(body.value)); break;
        case "/v1/suppressions": result = await input.application.suppress(parseSuppression(body.value)); break;
        default: result = await input.application.release(parseRelease(body.value));
      }
      return respond(200, input.present(result, requestId));
    } catch (failure) {
      if (failure instanceof AcquisitionValidationError) return error(400, "INVALID_REQUEST");
      if (failure instanceof AcquisitionConflictError) return error(409, "IDEMPOTENCY_CONFLICT");
      if (failure instanceof AcquisitionNotFoundError) return error(404, "NOT_FOUND");
      return error(503, "UNAVAILABLE");
    }
  };
}
