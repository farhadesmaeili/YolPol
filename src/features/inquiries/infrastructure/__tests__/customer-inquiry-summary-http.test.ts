import {describe, expect, it, vi} from "vitest";
import {createCustomerInquirySummaryRequestHandler} from "@/features/inquiries/infrastructure/http/customer-inquiry-summary-request-handler";
import {siteConfig} from "@/shared/config/site";
import {InquiryRateLimiter} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";

const token = `ypc_${"a".repeat(43)}`;
const request = (cookie = `__Host-yolpol_customer_conversation=${token}`, origin: string = siteConfig.url) => new Request(`${siteConfig.url}/api/customer/conversation/summary?inquiryId=other-customer`, {headers: {cookie, origin}});

describe("Customer summary authorization", () => {
  it("derives inquiry identity only from the validated cookie and uses no-store", async () => {
    const execute = vi.fn().mockResolvedValue({items: []});
    const resolve = vi.fn().mockResolvedValue({status: "resolved", inquiryId: "authorized-inquiry"});
    const handle = createCustomerInquirySummaryRequestHandler(() => ({execute: resolve}), () => ({execute}), {}, {NODE_ENV: "production"});
    const response = await handle(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(resolve).toHaveBeenCalledWith({token});
    expect(execute).toHaveBeenCalledWith({inquiryId: "authorized-inquiry"});
  });
  it.each(["", "__Host-yolpol_customer_conversation=invalid", `__Host-yolpol_customer_conversation=${token}; __Host-yolpol_customer_conversation=${token}`])("rejects missing, malformed or duplicate cookies", async (cookie) => {
    const resolve = vi.fn(); const execute = vi.fn();
    const handle = createCustomerInquirySummaryRequestHandler(() => ({execute: resolve}), () => ({execute}), {}, {NODE_ENV: "production"});
    expect((await handle(request(cookie))).status).toBe(401);
    expect(resolve).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
  });
  it("rejects foreign origins before resolving access", async () => {
    const resolve = vi.fn();
    const handle = createCustomerInquirySummaryRequestHandler(() => ({execute: resolve}), () => ({execute: vi.fn()}), {}, {NODE_ENV: "production"});
    expect((await handle(request(undefined, "https://untrusted.example"))).status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });
  it("does not read an inquiry for expired or revoked access", async () => {
    const execute = vi.fn();
    const handle = createCustomerInquirySummaryRequestHandler(() => ({execute: async () => ({status: "unauthorized"})}), () => ({execute}), {}, {NODE_ENV: "production"});
    expect((await handle(request())).status).toBe(401); expect(execute).not.toHaveBeenCalled();
  });
  it("contains persistence failures without exposing implementation details", async () => {
    const handle = createCustomerInquirySummaryRequestHandler(() => ({execute: async () => {throw new Error("private database connection");}}), () => ({execute: vi.fn()}), {}, {NODE_ENV: "production"});
    const response = await handle(request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({status: "error"});
  });
  it("enforces the read limiter before querying access", async () => {
    const resolve = vi.fn();
    const rateLimiter = new InquiryRateLimiter({maxRequests: 1, windowMs: 60_000});
    rateLimiter.consume();
    const handle = createCustomerInquirySummaryRequestHandler(() => ({execute: resolve}), () => ({execute: vi.fn()}), {rateLimiter}, {NODE_ENV: "production"});
    expect((await handle(request())).status).toBe(429); expect(resolve).not.toHaveBeenCalled();
  });
});
