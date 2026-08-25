import {describe, expect, it, vi} from "vitest";

import type {ReceiveCustomerMessageResult} from "@/features/inquiries/application/results/receive-customer-message-result";
import {InquiryRateLimiter} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";
import {createCustomerMessageRequestHandler} from "@/features/inquiries/infrastructure/http/customer-message-request-handler";
import {inquiryRequestSizeLimit} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";

const routeContext = (inquiryId = "inquiry-1") => ({params: Promise.resolve({inquiryId})});
const request = (body: string, headers: HeadersInit = {}) => new Request("https://yolpol.com/api/inquiries/inquiry-1/messages", {
  method: "POST",
  body,
  headers: {"Content-Type": "application/json", Origin: "https://yolpol.com", ...headers},
});

function handler(result: ReceiveCustomerMessageResult = {status: "created", messageId: "message-1"}) {
  const execute = vi.fn().mockResolvedValue(result);
  return {execute, handle: createCustomerMessageRequestHandler(() => ({execute}))};
}

describe("Customer message request handler", () => {
  it("accepts a valid customer Website message", async () => {
    const {execute, handle} = handler();
    const response = await handle(request(JSON.stringify({message: "Where is my quote?"})), routeContext());

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({status: "created", messageId: "message-1"});
    expect(execute).toHaveBeenCalledWith({inquiryId: "inquiry-1", message: "Where is my quote?"});
  });

  it.each([
    [request("{"), 400, "invalid_request"],
    [request("{}"), 422, "validation_failed"],
    [request(JSON.stringify({message: "hello", senderType: "INTERNAL_USER"})), 422, "validation_failed"],
    [request(JSON.stringify({message: 42})), 422, "validation_failed"],
    [request("x".repeat(inquiryRequestSizeLimit + 1)), 413, "payload_too_large"],
    [request("{}", {"Content-Type": "text/plain"}), 415, "unsupported_media_type"],
    [request("{}", {Origin: "https://attacker.example"}), 403, "invalid_origin"],
  ])("rejects invalid or unsafe request %#", async (input, status, code) => {
    const {execute, handle} = handler();
    const response = await handle(input, routeContext());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({status: "error", code});
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [{status: "conversation_not_found"}, 404, "conversation_not_found"],
    [{status: "validation_failed", field: "message"}, 422, "validation_failed"],
    [{status: "conflict"}, 409, "conflict"],
    [{status: "persistence_failed"}, 503, "service_unavailable"],
    [{status: "dependency_failed"}, 503, "service_unavailable"],
  ] as const)("maps %s safely", async (result, status, code) => {
    const response = await handler(result).handle(request(JSON.stringify({message: "hello"})), routeContext());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({status: "error", code});
  });

  it("enforces message constraints and rate limiting without leaking details", async () => {
    const execute = vi.fn().mockResolvedValue({status: "validation_failed", field: "message", detail: "sensitive content"});
    const limiter = new InquiryRateLimiter({maxRequests: 1, windowMs: 5_000}, () => 0);
    const handle = createCustomerMessageRequestHandler(() => ({execute}), {rateLimiter: limiter});
    const invalid = await handle(request(JSON.stringify({message: "x".repeat(10_001)})), routeContext());
    expect(invalid.status).toBe(422);
    expect(await invalid.text()).not.toContain("sensitive");
    const limited = await handle(request(JSON.stringify({message: "hello"})), routeContext());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("5");
  });
});
