import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {NotificationDestinationRepository} from "@/features/notification-destinations/application/ports/notification-destination-ports";
import {
  ConsumeTelegramGroupConnectionRequest,
  CreateTelegramGroupConnectionRequest,
  ListNotificationDestinations,
  SetTeamMemberNotifications,
} from "@/features/notification-destinations/application/use-cases/notification-destination-use-cases";
import {NodeNotificationDestinationIdGenerator, NodeTelegramGroupTokenService} from "@/features/notification-destinations/infrastructure/security/telegram-group-token-service";

const principal = (role: StaffPrincipal["role"], suffix = role.toLowerCase()): StaffPrincipal => ({staffAccountId: `account-${suffix}`, teamMemberId: `member-${suffix}`, role, displayName: role, actorReference: `staff:member-${suffix}`});
const emptyValue = {teamMembers: [], groups: [], auditEvents: [], mayCreateGroupRequest: true};
function repository(): NotificationDestinationRepository {
  return {
    read: vi.fn().mockResolvedValue(emptyValue),
    setTeamMember: vi.fn().mockResolvedValue("changed"),
    createGroupRequest: vi.fn().mockResolvedValue("created"),
    revokeGroupRequest: vi.fn().mockResolvedValue("revoked"),
    consumeGroupRequest: vi.fn().mockResolvedValue("authorized"),
    setGroup: vi.fn().mockResolvedValue("changed"),
  };
}
const tokens = () => new NodeTelegramGroupTokenService(() => Buffer.alloc(32, 1), () => "00000000-0000-4000-8000-000000000001");
const ids = new NodeNotificationDestinationIdGenerator(() => "00000000-0000-4000-8000-000000000002");

describe("notification destination use cases", () => {
  it.each(["SALES", "VIEWER"] as const)("denies %s before repository access", async (role) => {
    const value = repository();
    await expect(new ListNotificationDestinations(value, new StaffAuthorizationPolicy()).execute(principal(role))).resolves.toEqual({status: "forbidden"});
    await expect(new SetTeamMemberNotifications(value, new StaffAuthorizationPolicy(), ids).execute({principal: principal(role), targetStaffAccountId: "account-self", enabled: true})).resolves.toEqual({status: "forbidden"});
    expect(value.read).not.toHaveBeenCalled(); expect(value.setTeamMember).not.toHaveBeenCalled();
  });

  it("uses current account hierarchy while allowing an authorized manager to opt in self", async () => {
    const value = repository();
    const useCase = new SetTeamMemberNotifications(value, new StaffAuthorizationPolicy(), ids);
    await useCase.execute({principal: principal("ADMIN"), targetStaffAccountId: "account-admin", enabled: true});
    const call = vi.mocked(value.setTeamMember).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    const actor = {staffAccountId: "account-admin", teamMemberId: "member-admin", role: "ADMIN" as const, accountActive: true, teamMemberActive: true, displayName: "Admin"};
    expect(call!.authorize(actor, actor)).toBe(true);
    expect(call!.authorize(actor, {...actor, staffAccountId: "account-sales", teamMemberId: "member-sales", role: "SALES"})).toBe(true);
    expect(call!.authorize(actor, {...actor, staffAccountId: "account-peer", teamMemberId: "member-peer"})).toBe(false);
  });

  it("creates a manager-bound ten-minute ypg request without persisting the raw credential", async () => {
    const value = repository();
    const result = await new CreateTelegramGroupConnectionRequest(value, tokens(), new StaffAuthorizationPolicy(), {now: () => new Date("2026-09-14T12:00:00Z")}).execute({principal: principal("ADMIN")});
    expect(result).toMatchObject({status: "created", connectionToken: expect.stringMatching(/^ypg_/u), expiresAt: "2026-09-14T12:10:00.000Z"});
    const request = vi.mocked(value.createGroupRequest).mock.calls[0]?.[0].request;
    expect(request.staffAccountId).toBe("account-admin");
    expect(JSON.stringify(request)).not.toContain("ypg_");
  });

  it("rejects malformed group tokens before persistence and delegates verified numeric provider facts", async () => {
    const value = repository();
    const useCase = new ConsumeTelegramGroupConnectionRequest(value, tokens(), ids, new StaffAuthorizationPolicy());
    await expect(useCase.execute({connectionToken: "bad", telegramUserId: "123", groupChatId: "-1001", displayName: "Ops"})).resolves.toEqual({status: "unavailable"});
    expect(value.consumeGroupRequest).not.toHaveBeenCalled();
    const issued = tokens().issue();
    await expect(useCase.execute({connectionToken: issued.credential, telegramUserId: "123", groupChatId: "-1001", displayName: "Ops"})).resolves.toEqual({status: "authorized"});
    const call = vi.mocked(value.consumeGroupRequest).mock.calls[0]?.[0];
    expect(call?.senderTelegramUserId.value).toBe("123");
    expect(call?.groupChatId.value).toBe("-1001");
  });
});
