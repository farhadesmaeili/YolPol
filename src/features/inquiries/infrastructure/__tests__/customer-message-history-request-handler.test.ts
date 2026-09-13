import {describe, expect, it, vi} from "vitest";

import type {GetConversationMessageHistoryResult} from "@/features/inquiries/application/results/get-conversation-message-history-result";
import {createCustomerMessageHistoryRequestHandler} from "@/features/inquiries/infrastructure/http/customer-message-history-request-handler";
import {InquiryRateLimiter} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";

const routeContext = (inquiryId = "inquiry-1") => ({params: Promise.resolve({inquiryId})});
const request = (origin = "https://yolpol.com") => new Request("https://yolpol.com/api/inquiries/inquiry-1/messages", {headers: {Origin: origin}});
const messages = [
  {id: "message-1", senderType: "CUSTOMER", channel: "WEBSITE", body: "Please send an update.", createdAt: "2026-08-25T08:00:00.000Z"},
  {id: "message-2", senderType: "INTERNAL_USER", channel: "TELEGRAM", body: "Your quote is being prepared.", createdAt: "2026-08-25T08:05:00.000Z"},
] as const;

function handler(result: GetConversationMessageHistoryResult = {status: "found", messages}) {
  const execute = vi.fn().mockResolvedValue(result);
  return {execute, handle: createCustomerMessageHistoryRequestHandler(() => ({execute}))};
}

describe("Customer message history request handler", () => {
  it("returns only the ordered public message fields", async () => {
    const {execute, handle} = handler();
    const response = await handle(request(), routeContext());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({messages});
    expect(execute).toHaveBeenCalledWith({inquiryId: "inquiry-1"});
  });

  it.each([
    [{status: "conversation_not_found"}, 404, "conversation_not_found"],
    [{status: "validation_failed", field: "inquiryId"}, 422, "validation_failed"],
    [{status: "persistence_failed"}, 503, "service_unavailable"],
  ] as const)("maps %s to a safe API error", async (result, status, code) => {
    const response = await handler(result).handle(request(), routeContext(result.status === "validation_failed" ? "invalid/id" : "inquiry-1"));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({status: "error", code});
  });

  it("rejects an invalid Origin before executing the use case", async () => {
    const {execute, handle} = handler();
    const response = await handle(request("https://attacker.example"), routeContext());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({status: "error", code: "invalid_origin"});
    expect(execute).not.toHaveBeenCalled();
  });

  it("rate limits history reads independently and returns Retry-After", async () => {
    const execute = vi.fn().mockResolvedValue({status: "found", messages: []});
    const limiter = new InquiryRateLimiter({maxRequests: 1, windowMs: 5_000}, () => 0);
    const handle = createCustomerMessageHistoryRequestHandler(() => ({execute}), {rateLimiter: limiter});
    expect((await handle(request(), routeContext())).status).toBe(200);
    const limited = await handle(request(), routeContext());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("5");
  });

  it("maps composition and execution failures without leaking details", async () => {
    const throwingComposition = createCustomerMessageHistoryRequestHandler(() => { throw new Error("configuration secret"); });
    const throwingExecution = createCustomerMessageHistoryRequestHandler(() => ({execute: vi.fn().mockRejectedValue(new Error("database secret"))}));
    for (const handle of [throwingComposition, throwingExecution]) {
      const response = await handle(request(), routeContext());
      expect(response.status).toBe(503);
      expect(await response.text()).toBe('{"status":"error","code":"service_unavailable"}');
    }
  });

  it("returns a safe invalid request when route params cannot be read", async () => {
    const {execute, handle} = handler();
    const response = await handle(request(), {params: Promise.reject(new Error("router secret"))});
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({status: "error", code: "invalid_request"});
    expect(execute).not.toHaveBeenCalled();
  });
});
