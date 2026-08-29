import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {
  createStaffActivationRequestHandler,
  createStaffActiveChangeRequestHandler,
  createStaffInvitationRequestHandler,
  createStaffInvitationRevocationRequestHandler,
  createStaffRoleChangeRequestHandler,
  createStaffTeamRequestHandler,
} from "@/features/staff-authentication/infrastructure/http/staff-management-request-handlers";

const credential = `yps_${"A".repeat(43)}`;
const viewer: StaffPrincipal = Object.freeze({
  staffAccountId: "account-viewer",
  teamMemberId: "member-viewer",
  role: "VIEWER",
  displayName: "Viewer",
  actorReference: "staff:member-viewer",
});

function access(principal: StaffPrincipal = viewer) {
  return {resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated" as const, principal})}};
}

function management(status: "forbidden" | "persistence_failed" = "forbidden") {
  return {
    activateInvitation: {execute: vi.fn().mockResolvedValue({status: "invitation_unavailable" as const})},
    createInvitation: {execute: vi.fn().mockResolvedValue({status})},
    listTeam: {execute: vi.fn().mockResolvedValue({status})},
    changeRole: {execute: vi.fn().mockResolvedValue({status})},
    setActive: {execute: vi.fn().mockResolvedValue({status})},
    revokeInvitation: {execute: vi.fn().mockResolvedValue({status})},
  };
}

function request(path: string, input: Readonly<{body?: string; contentType?: string; method?: string; origin?: string}> = {}) {
  return new Request(`https://yolpol.com${path}`, {
    method: input.method ?? "POST",
    headers: {
      Cookie: `yolpol_staff_session=${credential}`,
      Origin: input.origin ?? "https://yolpol.com",
      ...(input.contentType === undefined ? {"Content-Type": "application/json"} : input.contentType ? {"Content-Type": input.contentType} : {}),
    },
    ...(input.body === undefined ? {} : {body: input.body}),
  });
}

const accountContext = {params: Promise.resolve({staffAccountId: "account-target"})};
const invitationContext = {params: Promise.resolve({invitationId: "invitation-target"})};

describe("Staff Team Management HTTP boundary", () => {
  it("denies Viewer direct HTTP access to every Team mutation", async () => {
    const staffAccess = access();
    const useCases = management();
    const responses = await Promise.all([
      createStaffInvitationRequestHandler(() => staffAccess, () => useCases)(request("/api/staff/team/invitations", {body: JSON.stringify({displayName: "Target", email: "target@example.test", targetRole: "SALES"})})),
      createStaffInvitationRevocationRequestHandler(() => staffAccess, () => useCases)(request("/api/staff/team/invitations/invitation-target/revoke"), invitationContext),
      createStaffRoleChangeRequestHandler(() => staffAccess, () => useCases)(request("/api/staff/team/accounts/account-target/role", {method: "PATCH", body: JSON.stringify({role: "SALES"})}), accountContext),
      createStaffActiveChangeRequestHandler(false, () => staffAccess, () => useCases)(request("/api/staff/team/accounts/account-target/deactivate"), accountContext),
      createStaffActiveChangeRequestHandler(true, () => staffAccess, () => useCases)(request("/api/staff/team/accounts/account-target/reactivate"), accountContext),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({status: "error", code: "forbidden"});
    }
  });

  it("rejects cross-origin mutation requests before session resolution", async () => {
    const staffAccess = access();
    const useCases = management();
    const response = await createStaffInvitationRequestHandler(() => staffAccess, () => useCases)(request(
      "/api/staff/team/invitations",
      {origin: "https://attacker.example", body: JSON.stringify({displayName: "Target", email: "target@example.test", targetRole: "SALES"})},
    ));
    expect(response.status).toBe(403);
    expect(staffAccess.resolveSession.execute).not.toHaveBeenCalled();
    expect(useCases.createInvitation.execute).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied actor identity fields", async () => {
    const useCases = management();
    const response = await createStaffInvitationRequestHandler(access, () => useCases)(request(
      "/api/staff/team/invitations",
      {body: JSON.stringify({displayName: "Target", email: "target@example.test", targetRole: "SALES", createdByStaffAccountId: "attacker"})},
    ));
    expect(response.status).toBe(400);
    expect(useCases.createInvitation.execute).not.toHaveBeenCalled();
  });

  it("returns only safe Team data with no-store caching", async () => {
    const staffAccess = access({...viewer, role: "SUPER_ADMIN"});
    const useCases = management();
    useCases.listTeam.execute.mockResolvedValue({
      status: "found",
      team: {
        accounts: [{id: "account-1", displayName: "Staff", normalizedEmail: "staff@example.test", role: "SALES", active: true, createdAt: "2026-08-28T00:00:00.000Z", telegramLinked: true}],
        invitations: [],
      },
    });
    const response = await createStaffTeamRequestHandler(() => staffAccess, () => useCases)(request("/api/staff/team", {method: "GET", contentType: ""}));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain('"telegramLinked":true');
    expect(serialized).not.toMatch(/token|password|session|externalId|chatId|credential/iu);
  });
});

describe("Staff activation HTTP boundary", () => {
  it.each(["invitation_unavailable", "account_conflict"] as const)("neutralizes %s", async (status) => {
    const useCases = management();
    useCases.activateInvitation.execute.mockResolvedValue({status});
    const response = await createStaffActivationRequestHandler(() => useCases)(request("/api/staff/activation", {
      body: JSON.stringify({email: "invited@example.test", activationCode: `ypi_${"A".repeat(43)}`, password: "correct horse battery staple"}),
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({status: "error", code: "invitation_unavailable"});
  });

  it("returns the one-time raw activation code only from successful invitation creation", async () => {
    const staffAccess = access({...viewer, role: "SUPER_ADMIN"});
    const useCases = management();
    useCases.createInvitation.execute.mockResolvedValue({status: "created", invitationId: "invitation-1", activationCode: `ypi_${"B".repeat(43)}`, expiresAt: "2026-08-29T00:00:00.000Z"});
    const response = await createStaffInvitationRequestHandler(() => staffAccess, () => useCases)(request("/api/staff/team/invitations", {
      body: JSON.stringify({displayName: "Target", email: "target@example.test", targetRole: "SALES"}),
    }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({status: "created", invitationId: "invitation-1", activationCode: `ypi_${"B".repeat(43)}`, expiresAt: "2026-08-29T00:00:00.000Z"});
  });
});
