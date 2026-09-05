import {describe, expect, it, vi} from "vitest";
import {createTranslationRemediationRequestHandler} from "@/features/conversation-translation/infrastructure/http/translation-remediation-request-handler";
import {RemediateTranslation} from "@/features/conversation-translation/application/use-cases/remediate-translation";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

const context = {params: Promise.resolve({inquiryId: "inquiry", messageId: "message"})};
function setup(role: StaffRole = "SALES", authenticated = true) {
  const repository = {remediate: vi.fn().mockResolvedValue("updated")};
  const principal = {staffAccountId: "account", teamMemberId: "member", role, displayName: "Sales", actorReference: "staff:member"};
  const handler = createTranslationRemediationRequestHandler(() => ({resolveSession: {execute: async () => authenticated
    ? {status: "authenticated" as const, principal} : {status: "unauthorized" as const}}}),
  () => new RemediateTranslation(repository, new StaffAuthorizationPolicy()), {environment: {NODE_ENV: "test"}, rateLimiter: {consume: () => ({allowed: true})}});
  return {repository, handler};
}
function request(payload: unknown, origin = "https://yolpol.com", cookie = true, query = "") {
  return new Request(`https://yolpol.com/api/staff/inquiries/inquiry/messages/message/translation${query}`, {method: "POST",
    headers: {Origin: origin, "Content-Type": "application/json", ...(cookie ? {Cookie: "yolpol_staff_session=credential"} : {})}, body: JSON.stringify(payload)});
}
describe("Staff translation remediation boundary", () => {
  it.each(["SUPER_ADMIN", "ADMIN", "SALES"] as const)("authorizes %s with a derived actor and durable identities", async (role) => {
    const {handler, repository} = setup(role);
    const payload = {action: "RETRY", expectedVersion: 3, targetLocale: "tr"};
    expect((await handler(request(payload), context)).status).toBe(200);
    expect(repository.remediate).toHaveBeenCalledWith({...payload, inquiryId: "inquiry", messageId: "message", actorReference: "staff:member"});
  });
  it.each(["RETRY", "SKIP", "CONFIRM_LANGUAGE"])("denies VIEWER for %s before persistence", async (action) => {
    const {handler, repository} = setup("VIEWER");
    expect((await handler(request({action, expectedVersion: 1}), context)).status).toBe(403);
    expect(repository.remediate).not.toHaveBeenCalled();
  });
  it.each([
    {action: "SKIP", expectedVersion: 1, actorReference: "staff:forged"},
    {action: "RETRY", expectedVersion: 1, targetLocale: "tr", body: "Injected source"},
    {action: "RETRY", expectedVersion: 0, targetLocale: "tr"},
    {action: "CONFIRM_LANGUAGE", expectedVersion: 1, sourceLocale: "de"},
    {action: "CONFIRM_LANGUAGE", expectedVersion: 1, sourceLocale: "fa", customerTargetLocale: "fa"},
    {action: "SKIP", expectedVersion: 1, role: "ADMIN"},
  ])("rejects untrusted fields and invalid lifecycle input %j", async (payload) => {
    const {handler, repository} = setup(); expect((await handler(request(payload), context)).status).toBe(400);
    expect(repository.remediate).not.toHaveBeenCalled();
  });
  it("requires exact Origin, a valid session, a bounded body and no query", async () => {
    const {handler, repository} = setup(); const payload = {action: "SKIP", expectedVersion: 1};
    expect((await handler(request(payload, "https://evil.example"), context)).status).toBe(403);
    expect((await handler(request(payload, "https://yolpol.com", false), context)).status).toBe(401);
    expect((await setup("SALES", false).handler(request(payload), context)).status).toBe(401);
    expect((await handler(request(payload, "https://yolpol.com", true, "?actor=forged"), context)).status).toBe(400);
    expect((await handler(request({...payload, padding: "x".repeat(1024)}), context)).status).toBe(413);
    expect(repository.remediate).not.toHaveBeenCalled();
  });
  it("returns safe conflicts and persistence errors", async () => {
    const {handler, repository} = setup(); repository.remediate.mockResolvedValueOnce("conflict");
    expect((await handler(request({action: "SKIP", expectedVersion: 1}), context)).status).toBe(409);
    repository.remediate.mockRejectedValueOnce(new Error("provider private text"));
    const response = await handler(request({action: "SKIP", expectedVersion: 1}), context);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
  });
});
