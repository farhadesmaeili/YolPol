import {describe, expect, it, vi} from "vitest";

import {
  createCustomerConversationHistoryRequestHandler,
  createCustomerConversationMessageRequestHandler,
  createCustomerResumeHistoryRequestHandler,
  createCustomerResumeMessageRequestHandler,
} from "@/features/inquiries/infrastructure/http/customer-conversation-request-handler";

const token = `ypc_${"A".repeat(43)}`;
const context = (value = token) => ({params: Promise.resolve({token: value})});
const postRequest = (origin = "https://yolpol.com") => new Request(`https://yolpol.com/api/conversations/${token}/messages`, {method: "POST", headers: {"Content-Type": "application/json", Origin: origin}, body: JSON.stringify({message: "Please update me."})});
const getRequest = (origin = "https://yolpol.com") => new Request(`https://yolpol.com/api/conversations/${token}/messages`, {headers: {Origin: origin}});
const resolved = {status: "resolved", conversationId: "conversation-1", inquiryId: "inquiry-1"} as const;

function containsInternalActor(value: unknown): boolean {
  if (typeof value === "string") return value.includes("staff:admin-main") || value.includes("admin-main");
  if (Array.isArray(value)) return value.some(containsInternalActor);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(([key, entry]) => key.toLowerCase() === "actorreference" || containsInternalActor(entry));
}

describe("customer actor-attribution confidentiality inspection", () => {
  it("detects a forbidden actor key or value at a nested depth", () => {
    expect(containsInternalActor({safe: [{nested: {actorReference: "staff:admin-main"}}]})).toBe(true);
    expect(containsInternalActor({safe: [{nested: "admin-main"}]})).toBe(true);
  });
});

describe("Customer conversation token request handlers", () => {
  it("sends a customer message only after valid conversation resolution", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved);
    const execute = vi.fn().mockResolvedValue({status: "created", messageId: "message-1"});
    const response = await createCustomerConversationMessageRequestHandler(() => ({execute: resolve}), () => ({execute}))(postRequest(), context());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({status: "created", messageId: "message-1"});
    expect(resolve).toHaveBeenCalledWith({token});
    expect(execute).toHaveBeenCalledWith({inquiryId: "inquiry-1", message: "Please update me."});
  });

  it("loads history only after valid conversation resolution", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved);
    const messages = [{id: "message-1", senderType: "CUSTOMER", channel: "WEBSITE", body: "Hello", createdAt: "2026-08-25T10:00:00.000Z"}] as const;
    const execute = vi.fn().mockResolvedValue({status: "found", messages});
    const response = await createCustomerConversationHistoryRequestHandler(() => ({execute: resolve}), () => ({execute}))(getRequest(), context());
    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({messages});
    expect(containsInternalActor(responseBody)).toBe(false);
    expect(execute).toHaveBeenCalledWith({inquiryId: "inquiry-1"});
  });

  it.each(["unauthorized", "expired"])("returns one safe unauthorized response for %s access", async () => {
    const resolve = vi.fn().mockResolvedValue({status: "unauthorized"});
    const execute = vi.fn();
    const response = await createCustomerConversationMessageRequestHandler(() => ({execute: resolve}), () => ({execute}))(postRequest(), context());
    const responseText = await response.text();
    expect(response.status).toBe(401);
    expect(responseText).toBe('{"status":"error","code":"unauthorized"}');
    expect(responseText).not.toContain(token);
    expect(execute).not.toHaveBeenCalled();
  });

  it("preserves strict origin rejection before token resolution", async () => {
    const resolve = vi.fn();
    const response = await createCustomerConversationHistoryRequestHandler(() => ({execute: resolve}), () => ({execute: vi.fn()}))(getRequest("https://attacker.example"), context());
    expect(response.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("Customer Conversation cookie request handlers", () => {
  const environment = {NODE_ENV: "production"};
  const cookie = `__Host-yolpol_customer_conversation=${token}`;

  it("restores history from the HttpOnly credential without a token-bearing URL", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved);
    const messages = [{id: "message-1", senderType: "CUSTOMER", channel: "WEBSITE", body: "Hello", createdAt: "2026-08-25T10:00:00.000Z"}] as const;
    const execute = vi.fn().mockResolvedValue({status: "found", messages});
    const response = await createCustomerResumeHistoryRequestHandler(
      () => ({execute: resolve}),
      () => ({execute}),
      {},
      environment,
    )(new Request("https://yolpol.com/api/customer/conversation", {headers: {Cookie: cookie, Origin: "https://yolpol.com"}}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({messages});
    expect(resolve).toHaveBeenCalledWith({token});
  });

  it("posts through cookie auth only after explicit same-Origin validation", async () => {
    const resolve = vi.fn().mockResolvedValue(resolved);
    const execute = vi.fn().mockResolvedValue({status: "created", messageId: "message-1"});
    const handler = createCustomerResumeMessageRequestHandler(() => ({execute: resolve}), () => ({execute}), {}, environment);
    const response = await handler(new Request("https://yolpol.com/api/customer/conversation/messages", {method: "POST", headers: {Cookie: cookie, Origin: "https://yolpol.com", "Content-Type": "application/json"}, body: '{"message":"Please update me."}'}));
    expect(response.status).toBe(201);
    expect(execute).toHaveBeenCalledWith({inquiryId: "inquiry-1", message: "Please update me."});

    for (const headers of [new Headers({Cookie: cookie, "Content-Type": "application/json"}), new Headers({Cookie: cookie, Origin: "https://attacker.example", "Content-Type": "application/json"})]) {
      const rejected = await handler(new Request("https://yolpol.com/api/customer/conversation/messages", {method: "POST", headers, body: '{"message":"Blocked"}'}));
      expect(rejected.status).toBe(403);
    }
  });

  it.each([undefined, "__Host-yolpol_customer_conversation=malformed"])("maps a missing or rejected cookie to the same safe response", async (presentedCookie) => {
    const headers = new Headers({Origin: "https://yolpol.com"});
    if (presentedCookie) headers.set("Cookie", presentedCookie);
    const response = await createCustomerResumeHistoryRequestHandler(
      () => ({execute: vi.fn()}),
      () => ({execute: vi.fn()}),
      {},
      environment,
    )(new Request("https://yolpol.com/api/customer/conversation", {headers}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({status: "error", code: "unauthorized"});
  });

  it("does not distinguish an expired or otherwise rejected stored capability", async () => {
    const response = await createCustomerResumeHistoryRequestHandler(
      () => ({execute: vi.fn().mockResolvedValue({status: "unauthorized"})}),
      () => ({execute: vi.fn()}),
      {},
      environment,
    )(new Request("https://yolpol.com/api/customer/conversation", {headers: {Origin: "https://yolpol.com", Cookie: cookie}}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({status: "error", code: "unauthorized"});
  });
});
