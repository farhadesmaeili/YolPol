import {describe, expect, it, vi} from "vitest";

import type {SubmitInquiryInput} from "@/features/inquiries/application/dto/inquiry-dto";
import {createInquiryRequestHandler, inquiryRequestSizeLimit} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";

const valid: SubmitInquiryInput = {contact: {fullName: "Customer Name", email: "customer@example.test", phone: "+12025550100", preferredMethods: ["email"]}, location: {country: "TR"}, privacy: {accepted: true, policyVersion: "inquiry-contact-consent-v2"}, source: {locale: "en", path: "/en/inquiry"}, items: [{productId: "ylp-gb-250-og-rd", palletCount: 12}]};
const token = `ypc_${"A".repeat(43)}`;
const expiresAt = "2026-09-27T12:00:00.000Z";
const accepted = {status: "accepted", inquiry: {inquiryId: "real-id", status: "received", createdAt: "2026-08-28T12:00:00.000Z"}, conversationAccessToken: token, conversationAccessExpiresAt: expiresAt} as const;
const request = (body: string, headers: HeadersInit = {}) => new Request("https://yolpol.com/api/inquiries", {method: "POST", body, headers: {"Content-Type": "application/json", Origin: "https://yolpol.com", ...headers}});

describe("Inquiry request handler", () => {
  it("sets the production resume cookie while returning only safe success metadata", async () => {
    const execute = vi.fn().mockResolvedValue(accepted);
    const response = await createInquiryRequestHandler(() => ({execute}), {environment: {NODE_ENV: "production"}})(request(JSON.stringify(valid)));
    expect(response.status).toBe(201);
    const responseBody = await response.clone().json();
    expect(responseBody).toEqual({status: "created", inquiryId: "real-id"});
    expect(JSON.stringify(responseBody)).not.toContain(token);
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain(`__Host-yolpol_customer_conversation=${token}`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("Expires=Sun, 27 Sep 2026 12:00:00 GMT");
    expect(execute).toHaveBeenCalledWith(valid);
  });

  it("keeps an approved HTTP development origin usable without a Secure cookie", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const response = await createInquiryRequestHandler(
        () => ({execute: vi.fn().mockResolvedValue(accepted)}),
        {approvedDevelopmentOrigins: new Set(["http://192.168.1.100:3000"]), environment: {NODE_ENV: "development"}},
      )(new Request("http://192.168.1.100:3000/api/inquiries", {method: "POST", headers: {"Content-Type": "application/json", Origin: "http://192.168.1.100:3000"}, body: JSON.stringify(valid)}));
      expect(response.status).toBe(201);
      expect(response.headers.get("Set-Cookie")).toContain(`yolpol_customer_conversation=${token}`);
      expect(response.headers.get("Set-Cookie")).not.toContain("; Secure");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("replaces the one active browser cookie when a later Inquiry succeeds", async () => {
    const secondToken = `ypc_${"B".repeat(43)}`;
    const execute = vi.fn()
      .mockResolvedValueOnce(accepted)
      .mockResolvedValueOnce({...accepted, inquiry: {...accepted.inquiry, inquiryId: "second-id"}, conversationAccessToken: secondToken});
    const handler = createInquiryRequestHandler(() => ({execute}), {environment: {NODE_ENV: "production"}});
    const firstCookie = (await handler(request(JSON.stringify(valid)))).headers.get("Set-Cookie")!;
    const secondCookie = (await handler(request(JSON.stringify(valid)))).headers.get("Set-Cookie")!;
    expect(firstCookie).toContain(`__Host-yolpol_customer_conversation=${token}`);
    expect(secondCookie).toContain(`__Host-yolpol_customer_conversation=${secondToken}`);
  });

  it.each([
    [request("{"), 400, "invalid_request"],
    [new Request("https://yolpol.com/api/inquiries", {method: "POST", body: "{}", headers: {"Content-Type": "text/plain"}}), 415, "unsupported_media_type"],
    [request("x".repeat(inquiryRequestSizeLimit + 1)), 413, "payload_too_large"],
    [request(JSON.stringify(valid), {Origin: "https://attacker.example"}), 403, "invalid_origin"],
    [request(JSON.stringify({...valid, items: []})), 422, "validation_failed"],
  ])("rejects unsafe requests", async (input, status, code) => {
    const response = await createInquiryRequestHandler(() => ({execute: vi.fn().mockResolvedValue({status: "validation_failed", field: "request"})}))(input);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({code});
  });

  it("does not leak persistence details or set a cookie on failure", async () => {
    const response = await createInquiryRequestHandler(() => ({execute: vi.fn().mockResolvedValue({status: "persistence_failed", detail: "sql secret"})}))(request(JSON.stringify(valid)));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});
