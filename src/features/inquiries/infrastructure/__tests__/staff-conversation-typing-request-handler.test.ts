import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {ConversationTypingRateLimiter} from "@/features/inquiries/infrastructure/http/conversation-typing-rate-limiter";
import {createStaffConversationTypingRequestHandler} from "@/features/inquiries/infrastructure/http/staff-conversation-typing-request-handler";

const credential = `yps_${"A".repeat(43)}`;
const principal: StaffPrincipal = {staffAccountId: "account-1", teamMemberId: "member-1", role: "SALES", displayName: "Sales", actorReference: "staff:member-1"};
const context = (inquiryId = "inquiry-1") => ({params: Promise.resolve({inquiryId})});
const conversation = {status: "resolved", conversationId: "conversation-1"} as const;

function access(result: Readonly<Record<string, unknown>> = {status: "authenticated", principal}) {
  return {resolveSession: {execute: vi.fn().mockResolvedValue(result)}, authorization: new StaffAuthorizationPolicy()};
}

function request(body: BodyInit = '{"isTyping":true}', options: Readonly<{cookie?: string | null; origin?: string | null; query?: string}> = {}) {
  const headers = new Headers({"Content-Type": "application/json"});
  if (options.cookie !== null) headers.set("Cookie", options.cookie ?? `yolpol_staff_session=${credential}`);
  if (options.origin !== null) headers.set("Origin", options.origin ?? "https://yolpol.com");
  return new Request(`https://yolpol.com/api/staff/inquiries/inquiry-1/typing${options.query ?? ""}`, {method: "POST", headers, body});
}

describe("POST /api/staff/inquiries/[inquiryId]/typing", () => {
  it("authenticates, authorizes, resolves the conversation, and derives Staff actor identity server-side", async () => {
    const staffAccess = access();
    const resolver = {execute: vi.fn().mockResolvedValue(conversation)};
    const updater = {execute: vi.fn().mockReturnValue({status: "updated"})};
    const response = await createStaffConversationTypingRequestHandler(() => staffAccess, () => resolver, () => updater)(request(), context());
    expect(response.status).toBe(204);
    expect(staffAccess.resolveSession.execute).toHaveBeenCalledWith({sessionCredential: credential});
    expect(resolver.execute).toHaveBeenCalledWith({inquiryId: "inquiry-1"});
    expect(updater.execute).toHaveBeenCalledWith({conversationId: "conversation-1", participant: "STAFF", actorKey: "member-1", isTyping: true});
  });

  it.each([
    ["missing", request(undefined, {cookie: null}), access()],
    ["invalid", request(), access({status: "unauthorized"})],
  ])("returns 401 for %s authentication", async (_label, staffRequest, staffAccess) => {
    const updater = {execute: vi.fn()};
    const response = await createStaffConversationTypingRequestHandler(() => staffAccess, () => ({execute: vi.fn()}), () => updater)(staffRequest, context());
    expect(response.status).toBe(401);
    expect(updater.execute).not.toHaveBeenCalled();
  });

  it("returns 403 when the existing reply capability denies access", async () => {
    const staffAccess = access();
    staffAccess.authorization.mayReplyToCustomerConversation = () => false;
    const response = await createStaffConversationTypingRequestHandler(() => staffAccess, () => ({execute: vi.fn()}), () => ({execute: vi.fn()}))(request(), context());
    expect(response.status).toBe(403);
  });

  it.each([
    [{isTyping: true, actorReference: "staff:admin-main"}, "request"],
    [{isTyping: true, teamMemberId: "member-2"}, "request"],
    [{isTyping: true, staffAccountId: "account-2"}, "request"],
    [{isTyping: true, role: "ADMIN"}, "request"],
    [{isTyping: true, senderType: "STAFF"}, "request"],
    [{isTyping: 1}, "isTyping"],
  ])("rejects identity injection or invalid payload %#", async (value, field) => {
    const updater = {execute: vi.fn()};
    const response = await createStaffConversationTypingRequestHandler(
      () => access(),
      () => ({execute: vi.fn().mockResolvedValue(conversation)}),
      () => updater,
    )(request(JSON.stringify(value)), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({status: "error", code: "invalid_request", field});
    expect(updater.execute).not.toHaveBeenCalled();
  });

  it("maps missing conversations safely and applies a dedicated heartbeat rate limit", async () => {
    const limiter = new ConversationTypingRateLimiter({maxRequests: 1, windowMs: 60_000}, () => 0);
    const handler = createStaffConversationTypingRequestHandler(
      () => access(),
      () => ({execute: vi.fn().mockResolvedValue(conversation)}),
      () => ({execute: vi.fn().mockReturnValue({status: "updated"})}),
      {rateLimiter: limiter},
    );
    expect((await handler(request(), context())).status).toBe(204);
    expect((await handler(request(), context())).status).toBe(429);
    const missing = await createStaffConversationTypingRequestHandler(
      () => access(),
      () => ({execute: vi.fn().mockResolvedValue({status: "conversation_not_found"})}),
      () => ({execute: vi.fn()}),
    )(request(), context());
    expect(missing.status).toBe(404);
  });

  it.each([null, "https://attacker.example"])("strictly rejects Origin %s before session resolution", async (origin) => {
    const staffAccess = access();
    const response = await createStaffConversationTypingRequestHandler(() => staffAccess, () => ({execute: vi.fn()}), () => ({execute: vi.fn()}))(request(undefined, {origin}), context());
    expect(response.status).toBe(403);
    expect(staffAccess.resolveSession.execute).not.toHaveBeenCalled();
  });
});
