import {describe, expect, it, vi} from "vitest";
import {createTranslationControlRequestHandler, translationControlRequestSizeLimit} from "@/features/conversation-translation/infrastructure/http/translation-control-request-handler";
import {ChangeConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/change-conversation-translation-control";
import {GetConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/get-conversation-translation-control";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

const credential = `yps_${"A".repeat(43)}`;
const principal = {staffAccountId: "account", teamMemberId: "member", role: "SALES" as const, displayName: "Sales", actorReference: "staff:member"};
const context = {params: Promise.resolve({inquiryId: "inquiry"})};
const modes = {customerToStaffMode: "MANUAL" as const, staffToCustomerMode: "MANUAL" as const, aiToStaffMode: "ON_DEMAND" as const};

function request(body: unknown = {...modes, expectedVersion: 0}, options: Readonly<{origin?: string; cookie?: boolean; raw?: string}> = {}) {
  const headers = new Headers({Origin: options.origin ?? "https://yolpol.com", "Content-Type": "application/json"});
  if (options.cookie !== false) headers.set("Cookie", `yolpol_staff_session=${credential}`);
  return new Request("https://yolpol.com/api/staff/inquiries/inquiry/translation-control", {method: "PUT", headers, body: options.raw ?? JSON.stringify(body)});
}

function setup(role: "SALES" | "VIEWER" = "SALES") {
  const repository = {read: vi.fn().mockResolvedValue({...modes, version: 1}), change: vi.fn().mockResolvedValue("updated" as const)};
  const authorization = new StaffAuthorizationPolicy();
  const change = new ChangeConversationTranslationControl(repository, authorization, {generate: () => "event-1"}, {now: () => new Date()});
  const get = new GetConversationTranslationControl(repository, authorization);
  const handler = createTranslationControlRequestHandler(
    () => ({resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated", principal: {...principal, role}})}}),
    () => ({change, get}),
    {environment: {NODE_ENV: "test"}, rateLimiter: {consume: () => ({allowed: true})}},
  );
  return {handler, repository};
}

describe("PUT /api/staff/inquiries/[inquiryId]/translation-control", () => {
  it("persists only the three valid modes and optimistic version under the authenticated Staff actor", async () => {
    const {handler, repository} = setup();
    const response = await handler(request(), context);
    expect(response.status).toBe(200);
    expect(repository.change).toHaveBeenCalledWith(expect.objectContaining({...modes, expectedVersion: 0, actorReference: "staff:member"}));
    expect(await response.json()).toMatchObject({status: "updated", value: {...modes, version: 1}});
  });

  it("denies Viewer and rejects spoofed, provider, target-locale, invalid-mode, Origin, and oversized input", async () => {
    expect((await setup("VIEWER").handler(request(), context)).status).toBe(403);
    for (const body of [
      {...modes, expectedVersion: 0, actorReference: "staff:forged"},
      {...modes, expectedVersion: 0, targetLocale: "en"},
      {...modes, expectedVersion: 0, provider: "private"},
      {...modes, expectedVersion: 0, aiToStaffMode: "MANUAL"},
    ]) expect((await setup().handler(request(body), context)).status).toBe(400);
    expect((await setup().handler(request(undefined, {origin: "https://evil.example"}), context)).status).toBe(403);
    expect((await setup().handler(request(undefined, {cookie: false}), context)).status).toBe(401);
    expect((await setup().handler(request(undefined, {raw: JSON.stringify({...modes, expectedVersion: 0, padding: "x".repeat(translationControlRequestSizeLimit)})}), context)).status).toBe(413);
  });
});
