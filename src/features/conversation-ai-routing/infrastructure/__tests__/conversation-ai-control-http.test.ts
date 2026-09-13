import {describe, expect, it, vi} from "vitest";

import {createConversationAiControlRequestHandler, conversationAiControlRequestSizeLimit} from "@/features/conversation-ai-routing/infrastructure/http/conversation-ai-control-request-handler";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

const credential = `yps_${"A".repeat(43)}`;
const principal = {staffAccountId: "account-1", teamMemberId: "member-1", role: "SALES" as const, displayName: "Sales", actorReference: "staff:member-1"};
const context = {params: Promise.resolve({inquiryId: "inquiry-1"})};
const status = {state: "PAUSED" as const, version: 1, latestJob: null};

function request(body: unknown = {state: "PAUSED", expectedVersion: 0}, options: Readonly<{origin?: string; cookie?: boolean; contentType?: string; raw?: string}> = {}) {
  const headers = new Headers({Origin: options.origin ?? "https://yolpol.com", "Content-Type": options.contentType ?? "application/json"});
  if (options.cookie !== false) headers.set("Cookie", `yolpol_staff_session=${credential}`);
  return new Request("https://yolpol.com/api/staff/inquiries/inquiry-1/ai-control", {method: "PUT", headers, body: options.raw ?? JSON.stringify(body)});
}

function setup(role: "SALES" | "VIEWER" = "SALES") {
  const resolvedPrincipal = {...principal, role};
  const changeControl = {execute: vi.fn().mockImplementation(async (input) => new StaffAuthorizationPolicy().mayControlConversationAi(input.principal) ? {status: "updated"} : {status: "forbidden"})};
  const getStatus = {execute: vi.fn().mockResolvedValue({status: "found", value: status})};
  const handler = createConversationAiControlRequestHandler(
    () => ({resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated", principal: resolvedPrincipal})}, authorization: new StaffAuthorizationPolicy()}),
    () => ({changeControl, getStatus}),
    {rateLimiter: {consume: () => ({allowed: true})}},
  );
  return {handler, changeControl};
}

describe("PUT /api/staff/inquiries/[inquiryId]/ai-control", () => {
  it("uses authenticated server-derived actor identity and optimistic version", async () => {
    const {handler, changeControl} = setup();
    const response = await handler(request(), context);
    expect(response.status).toBe(200);
    expect(changeControl.execute).toHaveBeenCalledWith(expect.objectContaining({inquiryId: "inquiry-1", actorReference: "staff:member-1", expectedVersion: 0, state: "PAUSED"}));
  });

  it("denies VIEWER and rejects actor spoof fields, bad Origin, and oversized bodies", async () => {
    expect((await setup("VIEWER").handler(request(), context)).status).toBe(403);
    expect((await setup().handler(request({state: "PAUSED", expectedVersion: 0, actorReference: "staff:forged"}), context)).status).toBe(400);
    expect((await setup().handler(request(undefined, {origin: "https://evil.example"}), context)).status).toBe(403);
    expect((await setup().handler(request(undefined, {raw: JSON.stringify({state: "PAUSED", expectedVersion: 0, padding: "x".repeat(conversationAiControlRequestSizeLimit)})}), context)).status).toBe(413);
  });
});
