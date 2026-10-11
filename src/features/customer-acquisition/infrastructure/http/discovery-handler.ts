import type {CompanyDiscovery} from "@/features/customer-acquisition/application/use-cases/company-discovery";
import {DiscoveryError} from "@/features/customer-acquisition/domain/types/discovery-types";
import {AcquisitionValidationError} from "@/features/customer-acquisition/domain/types/acquisition-types";
import type {DiscoveryAuthenticator} from "@/features/customer-acquisition/infrastructure/config/discovery-auth-config";
import {parseDiscoveryBatch, parseDiscoveryEvidence, parseDiscoveryReview} from "@/features/customer-acquisition/infrastructure/validation/discovery-input";
import {FixedWindowRateLimiter} from "@/shared/infrastructure/http/fixed-window-rate-limiter";
import {readJsonBodyWithinLimit} from "@/shared/infrastructure/http/bounded-json-body";

type Presenters = Readonly<{
  receipt(value: Awaited<ReturnType<CompanyDiscovery["submit"]>>): unknown;
  batch(value: Awaited<ReturnType<CompanyDiscovery["batch"]>>): unknown;
  queue(value: Awaited<ReturnType<CompanyDiscovery["queue"]>>): unknown;
}>;
export function createDiscoveryHandler(input: Readonly<{application: CompanyDiscovery; authenticate: DiscoveryAuthenticator; present: Presenters;
  requestId(): string; log(fields: Readonly<{requestId: string; status: number; durationMs: number}>): void; limiter?: FixedWindowRateLimiter}>) {
  const limiter = input.limiter ?? new FixedWindowRateLimiter({maxRequests: 60, windowMs: 60000});
  return async (request: Request) => {
    const requestId = input.requestId(); const started = Date.now();
    const respond = (status: number, result: unknown) => {
      input.log({requestId, status, durationMs: Date.now() - started});
      return Response.json({requestId, result}, {status, headers: {"cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId}});
    };
    const error = (status: number, code: string) => respond(status, {error: code});
    try {
      if (!limiter.consume().allowed) return error(429, "RATE_LIMITED");
      const principal = input.authenticate(request.headers.get("authorization"));
      if (!principal) return error(401, "UNAUTHORIZED");
      const url = new URL(request.url); const path = url.pathname;
      const batch = /^\/v1\/discovery\/batches\/([a-f0-9-]{36})$/u.exec(path);
      const candidate = /^\/v1\/discovery\/candidates\/([a-f0-9-]{36})\/(evidence|reviews)$/u.exec(path);
      const intake = path === "/v1/discovery/batches";
      const queue = path === "/v1/discovery/review-queue";
      if (!batch && !candidate && !intake && !queue) return error(404, "NOT_FOUND");
      if (request.method !== (batch || queue ? "GET" : "POST")) return error(405, "METHOD_NOT_ALLOWED");
      if ((intake && principal.capability !== "INTAKE") || ((candidate || queue) && principal.capability !== "REVIEW")) return error(403, "FORBIDDEN");
      if (queue) {
        if ([...url.searchParams.keys()].some(key => key !== "after") || url.searchParams.getAll("after").length > 1) return error(400, "INVALID_REQUEST");
        return respond(200, input.present.queue(await input.application.queue(principal, url.searchParams.get("after"))));
      }
      if (url.search) return error(400, "INVALID_REQUEST");
      if (batch) return respond(200, input.present.batch(await input.application.batch(principal, batch[1])));
      if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "")) return error(415, "UNSUPPORTED_MEDIA_TYPE");
      const body = await readJsonBodyWithinLimit(request, intake ? 65536 : 8192);
      if (body.status === "too_large") return error(413, "BODY_TOO_LARGE");
      if (body.status !== "success") return error(400, "INVALID_REQUEST");
      const result = intake ? await input.application.submit(principal, parseDiscoveryBatch(body.value)) : candidate![2] === "evidence"
        ? await input.application.evidence(principal, candidate![1], parseDiscoveryEvidence(body.value))
        : await input.application.review(principal, candidate![1], parseDiscoveryReview(body.value));
      return respond(200, input.present.receipt(result));
    } catch (failure) {
      if (failure instanceof AcquisitionValidationError) return error(400, "INVALID_REQUEST");
      if (failure instanceof DiscoveryError) return error(failure.code === "INVALID_REQUEST" ? 400 : failure.code === "NOT_FOUND" ? 404 : ["POLICY_DENIED", "FORBIDDEN"].includes(failure.code) ? 403 : 409, failure.code);
      return error(503, "UNAVAILABLE");
    }
  };
}
