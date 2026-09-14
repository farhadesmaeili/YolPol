import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {createGetNotificationDestinationsHandler, createMutateNotificationDestinationsHandler} from "@/features/notification-destinations/infrastructure/http/notification-destination-request-handlers";

const credential = `yps_${"A".repeat(43)}`;
const principal: StaffPrincipal = {staffAccountId: "account-admin", teamMemberId: "member-admin", role: "ADMIN", displayName: "Admin", actorReference: "staff:member-admin"};
const access = () => ({resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated", principal})}});
const value = {teamMembers: [], groups: [], auditEvents: [], mayCreateGroupRequest: true};
function operations() { return {
  list: {execute: vi.fn().mockResolvedValue({status: "found", value})},
  setTeamMember: {execute: vi.fn().mockResolvedValue({status: "changed"})},
  createGroupRequest: {execute: vi.fn().mockResolvedValue({status: "created", connectionToken: `ypg_${"B".repeat(43)}`, expiresAt: "2026-09-14T12:10:00.000Z"})},
  revokeGroupRequest: {execute: vi.fn().mockResolvedValue({status: "revoked"})},
  setGroup: {execute: vi.fn().mockResolvedValue({status: "changed"})},
}; }
const options = () => ({approvedDevelopmentOrigins: new Set(["https://yolpol.com"]), rateLimiter: {consume: vi.fn().mockReturnValue({allowed: true})}});
function request(body?: unknown, origin = "https://yolpol.com") { return new Request("https://yolpol.com/api/staff/notification-destinations", {method: body === undefined ? "GET" : "POST", headers: {Origin: origin, "Content-Type": "application/json", Cookie: `yolpol_staff_session=${credential}`}, ...(body === undefined ? {} : {body: JSON.stringify(body)})}); }

describe("notification destination HTTP boundary", () => {
  it("returns only the safe authenticated read model", async () => {
    const response = await createGetNotificationDestinationsHandler(access, operations, options())(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toMatch(/externalId|chatId|telegramUserId|tokenLookup|tokenVerification|botToken|price/iu);
  });

  it("rejects arbitrary Telegram identity and authorization fields", async () => {
    for (const unsafe of [
      {operation: "ENABLE_TEAM_MEMBER", staffAccountId: "account-sales", externalId: "123"},
      {operation: "CREATE_GROUP_REQUEST", chatId: "-1001"},
      {operation: "ENABLE_GROUP", recipientId: "recipient-1", authorized: true},
      {operation: "ENABLE_GROUP", recipientId: "recipient-1", actorReference: "staff:attacker"},
    ]) {
      const response = await createMutateNotificationDestinationsHandler(access, operations, () => "YolpolBot", options())(request(unsafe));
      expect(response.status).toBe(400);
    }
  });

  it("requires exact Origin, authenticates before rate limiting, and constructs a validated startgroup link", async () => {
    const invalidOrigin = await createMutateNotificationDestinationsHandler(access, operations, () => "YolpolBot", options())(request({operation: "CREATE_GROUP_REQUEST"}, "https://attacker.test"));
    expect(invalidOrigin.status).toBe(403);
    const useCases = operations();
    const response = await createMutateNotificationDestinationsHandler(access, () => useCases, () => "YolpolBot", options())(request({operation: "CREATE_GROUP_REQUEST"}));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({status: "created", deepLink: `https://t.me/YolpolBot?startgroup=ypg_${"B".repeat(43)}`, expiresAt: "2026-09-14T12:10:00.000Z"});
  });

  it("validates public bot configuration before creating a persisted group request", async () => {
    const useCases = operations();
    const response = await createMutateNotificationDestinationsHandler(access, () => useCases, () => { throw new Error("invalid bot config"); }, options())(request({operation: "CREATE_GROUP_REQUEST"}));
    expect(response.status).toBe(503);
    expect(useCases.createGroupRequest.execute).not.toHaveBeenCalled();
  });
});
