import {describe, expect, it} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffTeamManagementDto} from "@/features/staff-authentication/application/dto/staff-management-dto";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {presentStaffTeamManagement} from "@/features/staff-authentication/presentation/presenters/staff-team-management-presenter";

const authorization = new StaffAuthorizationPolicy();
const actor = (role: StaffRole): StaffPrincipal => ({staffAccountId: "actor", teamMemberId: "actor-member", role, displayName: "Actor", actorReference: "staff:actor-member"});
const team = (role: StaffRole, telegramLinked = true): StaffTeamManagementDto => ({accounts: [{
  id: "target", displayName: "Target", normalizedEmail: "target@example.test", role, active: true,
  createdAt: "2026-08-30T00:00:00.000Z", telegramLinked,
}], invitations: []});

describe("Staff Team Telegram action presentation", () => {
  it.each([
    ["SUPER_ADMIN", "ADMIN", true],
    ["ADMIN", "SALES", true],
    ["ADMIN", "VIEWER", true],
    ["ADMIN", "ADMIN", false],
    ["ADMIN", "SUPER_ADMIN", false],
    ["SALES", "VIEWER", false],
    ["VIEWER", "SALES", false],
  ] as const)("presents %s controls for a %s target only when currently authorized", (actorRole, targetRole, expected) => {
    const actions = presentStaffTeamManagement(team(targetRole), actor(actorRole), authorization).accounts[0]!.actions;
    expect(actions.mayForceDisconnectTelegram).toBe(expected);
    expect(actions.mayRevokeTelegramRequest).toBe(expected);
  });

  it("shows force-disconnect only for an active canonical link while retaining authorized request revocation", () => {
    const actions = presentStaffTeamManagement(team("SALES", false), actor("ADMIN"), authorization).accounts[0]!.actions;
    expect(actions.mayForceDisconnectTelegram).toBe(false);
    expect(actions.mayRevokeTelegramRequest).toBe(true);
  });
});
