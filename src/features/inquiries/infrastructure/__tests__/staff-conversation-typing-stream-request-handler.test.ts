import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {createStaffConversationTypingStreamRequestHandler} from "@/features/inquiries/infrastructure/http/staff-conversation-typing-stream-request-handler";

const credential = `yps_${"A".repeat(43)}`;
const principal: StaffPrincipal = {staffAccountId: "account-1", teamMemberId: "member-1", role: "SALES", displayName: "Sales", actorReference: "staff:member-1"};
const context = (inquiryId = "inquiry-1") => ({params: Promise.resolve({inquiryId})});
const request = (cookie: string | null = `yolpol_staff_session=${credential}`) => {
  const headers = new Headers({Origin: "https://yolpol.com"});
  if (cookie) headers.set("Cookie", cookie);
  return new Request("https://yolpol.com/api/staff/inquiries/inquiry-1/stream", {headers});
};

function access(allowed = true) {
  const authorization = new StaffAuthorizationPolicy();
  if (!allowed) authorization.mayReplyToCustomerConversation = () => false;
  return {resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated", principal})}, authorization};
}

describe("GET /api/staff/inquiries/[inquiryId]/stream", () => {
  it("authenticates, authorizes, isolates the requested conversation, and emits only safe customer typing", async () => {
    let listener: ((event: Readonly<{participant: "CUSTOMER"; isTyping: boolean}>) => void) | undefined;
    const close = vi.fn();
    const registry = {
      update: vi.fn(),
      subscribe: vi.fn((input: Readonly<{conversationId: string; participant: string; listener(event: Readonly<{participant: "CUSTOMER"; isTyping: boolean}>): void}>) => {
        listener = input.listener;
        return {close};
      }),
    };
    const response = await createStaffConversationTypingStreamRequestHandler(
      () => access(),
      () => ({execute: vi.fn().mockResolvedValue({status: "resolved", conversationId: "conversation-1"})}),
      () => registry,
      {heartbeatIntervalMs: 60_000},
    )(request(), context());
    expect(response.status).toBe(200);
    expect(registry.subscribe).toHaveBeenCalledWith(expect.objectContaining({conversationId: "conversation-1", participant: "CUSTOMER"}));
    const reader = response.body!.getReader();
    await reader.read();
    listener!({participant: "CUSTOMER", isTyping: true});
    const frame = new TextDecoder().decode((await reader.read()).value);
    expect(frame).toBe('event: typing\ndata: {"participant":"CUSTOMER","isTyping":true}\n\n');
    expect(frame).not.toMatch(/conversation-1|inquiry-1|account-1|member-1|staff:|email|role/u);
    await reader.cancel();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ["unauthenticated", request(null), access(), 401],
    ["forbidden", request(), access(false), 403],
  ])("rejects %s Staff access", async (_label, staffRequest, staffAccess, status) => {
    const registry = {update: vi.fn(), subscribe: vi.fn()};
    const response = await createStaffConversationTypingStreamRequestHandler(
      () => staffAccess,
      () => ({execute: vi.fn().mockResolvedValue({status: "resolved", conversationId: "conversation-1"})}),
      () => registry,
    )(staffRequest, context());
    expect(response.status).toBe(status);
    expect(registry.subscribe).not.toHaveBeenCalled();
  });

  it("does not subscribe when the inquiry conversation is absent", async () => {
    const registry = {update: vi.fn(), subscribe: vi.fn()};
    const response = await createStaffConversationTypingStreamRequestHandler(
      () => access(),
      () => ({execute: vi.fn().mockResolvedValue({status: "conversation_not_found"})}),
      () => registry,
    )(request(), context("inquiry-2"));
    expect(response.status).toBe(404);
    expect(registry.subscribe).not.toHaveBeenCalled();
  });
});
