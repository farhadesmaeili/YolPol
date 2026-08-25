import {describe, expect, it, vi} from "vitest";

import {createCustomerConversationHistoryRequestHandler, createCustomerConversationMessageRequestHandler} from "@/features/inquiries/infrastructure/http/customer-conversation-request-handler";

const token = `ypc_${"A".repeat(43)}`;
const context = (value = token) => ({params: Promise.resolve({token: value})});
const postRequest = (origin = "https://yolpol.com") => new Request(`https://yolpol.com/api/conversations/${token}/messages`, {method: "POST", headers: {"Content-Type": "application/json", Origin: origin}, body: JSON.stringify({message: "Please update me."})});
const getRequest = (origin = "https://yolpol.com") => new Request(`https://yolpol.com/api/conversations/${token}/messages`, {headers: {Origin: origin}});
const resolved = {status: "resolved", conversationId: "conversation-1", inquiryId: "inquiry-1"} as const;

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
    expect(await response.json()).toEqual({messages});
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
