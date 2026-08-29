import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {PasswordHasher} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {StaffManagementIdentity, StaffManagementRepository} from "@/features/staff-authentication/application/ports/staff-management-ports";
import {ActivateStaffInvitation} from "@/features/staff-authentication/application/use-cases/activate-staff-invitation";
import {BootstrapSuperAdmin} from "@/features/staff-authentication/application/use-cases/bootstrap-super-admin";
import {CreateStaffInvitation, staffInvitationLifetimeMs} from "@/features/staff-authentication/application/use-cases/create-staff-invitation";
import {ChangeStaffRole, SetStaffActive} from "@/features/staff-authentication/application/use-cases/manage-staff-account";
import {ResolveStaffConversationActor} from "@/features/staff-authentication/application/use-cases/resolve-staff-conversation-actor";
import {StaffInvitation} from "@/features/staff-authentication/domain/entities/staff-invitation";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {NodeStaffInvitationTokenService} from "@/features/staff-authentication/infrastructure/security/staff-invitation-token-service";

const now = new Date("2026-08-28T09:00:00.000Z");
const clock = {now: () => new Date(now)};
const authorization = new StaffAuthorizationPolicy();

function principal(role: StaffRole, id = `account-${role.toLowerCase()}`): StaffPrincipal {
  return Object.freeze({staffAccountId: id, teamMemberId: `member-${id}`, role, displayName: role, actorReference: `staff:member-${id}`});
}

function identity(role: StaffRole, id = `account-${role.toLowerCase()}`): StaffManagementIdentity {
  return Object.freeze({staffAccountId: id, teamMemberId: `member-${id}`, role, accountActive: true, teamMemberActive: true, displayName: role});
}

function repository(overrides: Partial<StaffManagementRepository> = {}): StaffManagementRepository {
  return {
    async createInvitation(input) { return input.authorize(identity("SUPER_ADMIN")) ? "created" : "forbidden"; },
    async findInvitationByLookup() { return null; },
    async activateInvitation() { return "activated"; },
    async listAccounts() { return []; },
    async listInvitations() { return []; },
    async revokeInvitation() { return "revoked"; },
    async changeRole(input) {
      return input.authorize(identity("SUPER_ADMIN"), {staffAccountId: input.targetStaffAccountId, role: "SALES", active: true}) ? "changed" : "forbidden";
    },
    async setActive(input) {
      return input.authorize(identity("SUPER_ADMIN"), {staffAccountId: input.targetStaffAccountId, role: "SALES", active: !input.active}) ? "changed" : "forbidden";
    },
    async bootstrapSuperAdmin() { return "promoted"; },
    ...overrides,
  };
}

function deterministicTokens() {
  return new NodeStaffInvitationTokenService(() => Buffer.alloc(32, 7), () => "00000000-0000-4000-8000-000000000001");
}

describe("CreateStaffInvitation", () => {
  it.each([
    ["SUPER_ADMIN", "ADMIN", "created"],
    ["SUPER_ADMIN", "SALES", "created"],
    ["SUPER_ADMIN", "VIEWER", "created"],
    ["ADMIN", "SALES", "created"],
    ["ADMIN", "VIEWER", "created"],
    ["ADMIN", "ADMIN", "forbidden"],
    ["ADMIN", "SUPER_ADMIN", "forbidden"],
    ["SALES", "VIEWER", "forbidden"],
    ["VIEWER", "SALES", "forbidden"],
  ] as const)("maps %s inviting %s to %s", async (actorRole, targetRole, expectedStatus) => {
    const repo = repository({
      async createInvitation(input) { return input.authorize(identity(actorRole)) ? "created" : "forbidden"; },
    });
    const result = await new CreateStaffInvitation(repo, deterministicTokens(), authorization, clock).execute({
      principal: principal(actorRole), displayName: "Invited Staff", email: " Invited@Example.test ", targetRole,
    });
    expect(result.status).toBe(expectedStatus);
  });

  it("stores only domain-separated digests and applies the single 24-hour policy constant", async () => {
    const stored: StaffInvitation[] = [];
    const repo = repository({async createInvitation(input) { stored.push(input.invitation); return "created"; }});
    const result = await new CreateStaffInvitation(repo, deterministicTokens(), authorization, clock).execute({
      principal: principal("SUPER_ADMIN"), displayName: " Invited Staff ", email: "Invited@Example.test", targetRole: "ADMIN",
    });
    expect(result).toMatchObject({status: "created", invitationId: "staff_invitation_00000000000040008000000000000001"});
    const persisted = stored[0];
    if (result.status !== "created" || !persisted) throw new Error("Expected invitation creation.");
    expect(result.expiresAt).toBe(new Date(now.getTime() + staffInvitationLifetimeMs).toISOString());
    expect(staffInvitationLifetimeMs).toBe(24 * 60 * 60 * 1_000);
    expect(persisted).toMatchObject({normalizedEmail: "invited@example.test", displayName: "Invited Staff", targetRole: "ADMIN"});
    expect(persisted.tokenLookup).toMatch(/^[a-f0-9]{64}$/u);
    expect(persisted.tokenVerification).toMatch(/^[a-f0-9]{64}$/u);
    expect(persisted.tokenLookup).not.toBe(persisted.tokenVerification);
    expect(JSON.stringify(persisted)).not.toContain(result.activationCode);
  });
});

describe("ActivateStaffInvitation", () => {
  const password = "correct horse battery staple";

  function invitation(tokens = deterministicTokens(), lifecycle: Readonly<{expiresAt?: Date; consumedAt?: Date; revokedAt?: Date}> = {}) {
    const issued = tokens.issue();
    return {
      issued,
      invitation: StaffInvitation.reconstitute({
        id: issued.invitationId,
        normalizedEmail: "invited@example.test",
        displayName: "Invited Staff",
        targetRole: "SALES",
        tokenLookup: issued.lookup,
        tokenVerification: issued.verification,
        createdByStaffAccountId: "account-admin",
        createdAt: new Date(now.getTime() - 1_000),
        expiresAt: lifecycle.expiresAt ?? new Date(now.getTime() + 60_000),
        ...(lifecycle.consumedAt ? {consumedAt: lifecycle.consumedAt} : {}),
        ...(lifecycle.revokedAt ? {revokedAt: lifecycle.revokedAt} : {}),
      }),
    };
  }

  it("returns the same neutral outcome for invalid code, wrong email, expired, revoked, and consumed invitations", async () => {
    for (const testCase of [
      {kind: "invalid-code"},
      {kind: "wrong-email"},
      {kind: "expired", expiresAt: now},
      {kind: "revoked", revokedAt: new Date(now.getTime() - 500)},
      {kind: "consumed", consumedAt: new Date(now.getTime() - 500)},
    ] as const) {
      const tokens = deterministicTokens();
      const current = invitation(tokens, testCase);
      const repo = repository({async findInvitationByLookup() { return current.invitation; }});
      const useCase = new ActivateStaffInvitation(repo, tokens, {hash: vi.fn(), verify: vi.fn()} as PasswordHasher, {accountId: () => "staff-new", teamMemberId: () => "member-new"}, authorization, clock);
      const result = await useCase.execute({
        email: testCase.kind === "wrong-email" ? "other@example.test" : "invited@example.test",
        activationCode: testCase.kind === "invalid-code" ? "not-an-invitation" : current.issued.credential,
        password,
      });
      expect(result, testCase.kind).toEqual({status: "invitation_unavailable"});
    }
  });

  it("hashes the chosen password, atomically delegates creation and consumption, and prevents replay", async () => {
    const tokens = deterministicTokens();
    const current = invitation(tokens);
    let storedInvitation = current.invitation;
    const activateInvitation = vi.fn<StaffManagementRepository["activateInvitation"]>(async (input) => {
      if (!input.authorizeCreator(identity("ADMIN", "account-admin"), "SALES")) return "forbidden";
      storedInvitation = StaffInvitation.reconstitute({
        id: current.invitation.id,
        normalizedEmail: current.invitation.normalizedEmail,
        displayName: current.invitation.displayName,
        targetRole: current.invitation.targetRole,
        tokenLookup: current.invitation.tokenLookup,
        tokenVerification: current.invitation.tokenVerification,
        createdByStaffAccountId: current.invitation.createdByStaffAccountId,
        createdAt: current.invitation.createdAt,
        expiresAt: current.invitation.expiresAt,
        consumedAt: now,
      });
      return "activated";
    });
    const repo = repository({async findInvitationByLookup() { return storedInvitation; }, activateInvitation});
    const hash = vi.fn().mockResolvedValue("$yolpol-scrypt$v=1$stored-password-hash");
    const useCase = new ActivateStaffInvitation(repo, tokens, {hash, verify: vi.fn()} as PasswordHasher, {accountId: () => "staff-new", teamMemberId: () => "member-new"}, authorization, clock);

    await expect(useCase.execute({email: "INVITED@example.test", activationCode: current.issued.credential, password})).resolves.toEqual({status: "activated"});
    expect(hash).toHaveBeenCalledWith(password);
    expect(activateInvitation).toHaveBeenCalledWith(expect.objectContaining({
      invitationId: current.invitation.id,
      normalizedEmail: "invited@example.test",
      passwordHash: "$yolpol-scrypt$v=1$stored-password-hash",
      staffAccountId: "staff-new",
      teamMemberId: "member-new",
    }));
    expect(JSON.stringify(activateInvitation.mock.calls[0]?.[0])).not.toContain(current.issued.credential);
    expect(activateInvitation.mock.calls[0]?.[0]).not.toHaveProperty("activatedAt");
    await expect(useCase.execute({email: "invited@example.test", activationCode: current.issued.credential, password})).resolves.toEqual({status: "invitation_unavailable"});
    expect(activateInvitation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["after expiry", new Date(now.getTime() + 1)],
    ["at the exact expiry boundary", new Date(now.getTime())],
  ] as const)("rejects neutrally when authoritative transaction time is %s", async (_label, authoritativeNow) => {
    const tokens = deterministicTokens();
    const current = invitation(tokens, {expiresAt: now});
    const preliminary = invitation(tokens, {expiresAt: new Date(now.getTime() + 1)});
    const activateInvitation = vi.fn<StaffManagementRepository["activateInvitation"]>(async () => (
      authoritativeNow >= current.invitation.expiresAt ? "invitation_unavailable" : "activated"
    ));
    const repo = repository({
      async findInvitationByLookup() { return preliminary.invitation; },
      activateInvitation,
    });
    const hash = vi.fn().mockResolvedValue("$yolpol-scrypt$v=1$stored-password-hash");
    const useCase = new ActivateStaffInvitation(repo, tokens, {hash, verify: vi.fn()} as PasswordHasher, {accountId: () => "staff-new", teamMemberId: () => "member-new"}, authorization, clock);

    await expect(useCase.execute({email: "invited@example.test", activationCode: current.issued.credential, password})).resolves.toEqual({status: "invitation_unavailable"});
    expect(hash).toHaveBeenCalledOnce();
    expect(activateInvitation).toHaveBeenCalledOnce();
    expect(activateInvitation.mock.calls[0]?.[0]).not.toHaveProperty("activatedAt");
  });

  it("permits at most one success when repeated activations race after the same preliminary read", async () => {
    const tokens = deterministicTokens();
    const current = invitation(tokens);
    let available = true;
    const repo = repository({
      async findInvitationByLookup() { return current.invitation; },
      async activateInvitation() {
        if (!available) return "invitation_unavailable";
        available = false;
        return "activated";
      },
    });
    const useCase = new ActivateStaffInvitation(repo, tokens, {hash: async () => "hash", verify: async () => false}, {accountId: () => crypto.randomUUID(), teamMemberId: () => crypto.randomUUID()}, authorization, clock);

    const results = await Promise.all([
      useCase.execute({email: "invited@example.test", activationCode: current.issued.credential, password}),
      useCase.execute({email: "invited@example.test", activationCode: current.issued.credential, password}),
    ]);
    expect(results.filter((result) => result.status === "activated")).toHaveLength(1);
    expect(results.filter((result) => result.status === "invitation_unavailable")).toHaveLength(1);
  });

  it("keeps account conflicts safe for the HTTP layer to neutralize", async () => {
    const tokens = deterministicTokens();
    const current = invitation(tokens);
    const repo = repository({
      async findInvitationByLookup() { return current.invitation; },
      async activateInvitation() { return "account_conflict"; },
    });
    const useCase = new ActivateStaffInvitation(repo, tokens, {hash: async () => "hash", verify: async () => false}, {accountId: () => "staff-new", teamMemberId: () => "member-new"}, authorization, clock);
    await expect(useCase.execute({email: "invited@example.test", activationCode: current.issued.credential, password})).resolves.toEqual({status: "account_conflict"});
  });
});

describe("Staff account mutation use cases", () => {
  it("re-authorizes current actor and target state for role and lifecycle changes", async () => {
    const changeRole = vi.fn<StaffManagementRepository["changeRole"]>(async (input) => input.authorize(identity("ADMIN"), {staffAccountId: "account-target", role: "SALES", active: true}) ? "changed" : "forbidden");
    const setActive = vi.fn<StaffManagementRepository["setActive"]>(async (input) => input.authorize(identity("ADMIN"), {staffAccountId: "account-target", role: "VIEWER", active: !input.active}) ? "changed" : "forbidden");
    const repo = repository({changeRole, setActive});
    await expect(new ChangeStaffRole(repo, authorization, clock).execute({principal: principal("ADMIN"), targetStaffAccountId: "account-target", newRole: "VIEWER"})).resolves.toEqual({status: "changed"});
    await expect(new SetStaffActive(repo, authorization, clock).execute({principal: principal("ADMIN"), targetStaffAccountId: "account-target", active: false})).resolves.toEqual({status: "changed"});
    expect(changeRole).toHaveBeenCalledWith(expect.objectContaining({actorStaffAccountId: "account-admin", targetStaffAccountId: "account-target", newRole: "VIEWER", changedAt: now}));
    expect(setActive).toHaveBeenCalledWith(expect.objectContaining({actorStaffAccountId: "account-admin", targetStaffAccountId: "account-target", active: false, changedAt: now}));
  });
});

describe("BootstrapSuperAdmin", () => {
  it.each([
    ["eligible active ADMIN", "promoted"],
    ["missing account", "not_found"],
    ["inactive Staff Account", "ineligible"],
    ["inactive linked Team Member", "ineligible"],
    ["SALES target", "ineligible"],
    ["VIEWER target", "ineligible"],
    ["SUPER_ADMIN target", "already_bootstrapped"],
    ["existing active SUPER_ADMIN", "already_bootstrapped"],
  ] as const)("returns the repository policy result for %s", async (_scenario, status) => {
    const bootstrapSuperAdmin = vi.fn<StaffManagementRepository["bootstrapSuperAdmin"]>().mockResolvedValue(status);
    const useCase = new BootstrapSuperAdmin(repository({bootstrapSuperAdmin}), clock);

    await expect(useCase.execute({staffAccountId: "account-admin"})).resolves.toEqual({status});
    expect(bootstrapSuperAdmin).toHaveBeenCalledExactlyOnceWith({
      targetStaffAccountId: "account-admin",
      changedAt: now,
    });
  });

  it("returns only the sanitized promotion status", async () => {
    const bootstrapSuperAdmin = vi.fn<StaffManagementRepository["bootstrapSuperAdmin"]>().mockResolvedValue("promoted");
    const result = await new BootstrapSuperAdmin(repository({bootstrapSuperAdmin}), clock).execute({staffAccountId: "account-admin"});

    expect(result).toEqual({status: "promoted"});
    expect(Object.keys(result)).toEqual(["status"]);
    expect(JSON.stringify(result)).not.toMatch(/account-admin|password|hash|session|token|credential/iu);
  });

  it("rejects invalid account references before repository delegation", async () => {
    const bootstrapSuperAdmin = vi.fn<StaffManagementRepository["bootstrapSuperAdmin"]>();
    const useCase = new BootstrapSuperAdmin(repository({bootstrapSuperAdmin}), clock);

    await expect(useCase.execute({staffAccountId: ""})).resolves.toEqual({status: "validation_failed"});
    await expect(useCase.execute({staffAccountId: "not a valid id"})).resolves.toEqual({status: "validation_failed"});
    expect(bootstrapSuperAdmin).not.toHaveBeenCalled();
  });

  it("neutralizes persistence failures", async () => {
    const bootstrapSuperAdmin = vi.fn<StaffManagementRepository["bootstrapSuperAdmin"]>().mockRejectedValue(new Error("postgresql://secret"));

    await expect(new BootstrapSuperAdmin(repository({bootstrapSuperAdmin}), clock).execute({staffAccountId: "account-admin"}))
      .resolves.toEqual({status: "persistence_failed"});
  });
});

describe("ResolveStaffConversationActor", () => {
  it.each([
    ["SUPER_ADMIN", true],
    ["ADMIN", true],
    ["SALES", true],
    ["VIEWER", false],
  ] as const)("maps an active %s Telegram identity to reply capability = %s", async (role, allowed) => {
    const useCase = new ResolveStaffConversationActor({
      async findByNormalizedEmail() { return null; },
      async findAuthorizationByTeamMemberId(teamMemberId) {
        return {staffAccountId: "account-1", teamMemberId, role, staffAccountActive: true, teamMemberActive: true, teamMemberDisplayName: "Staff"};
      },
    }, authorization);
    await expect(useCase.execute({teamMemberId: "member-1"})).resolves.toBe(allowed ? "staff:member-1" : null);
  });

  it.each([
    [false, true],
    [true, false],
  ] as const)("rejects accountActive=%s and teamMemberActive=%s", async (staffAccountActive, teamMemberActive) => {
    const useCase = new ResolveStaffConversationActor({
      async findByNormalizedEmail() { return null; },
      async findAuthorizationByTeamMemberId(teamMemberId) {
        return {staffAccountId: "account-1", teamMemberId, role: "SALES", staffAccountActive, teamMemberActive, teamMemberDisplayName: "Staff"};
      },
    }, authorization);
    await expect(useCase.execute({teamMemberId: "member-1"})).resolves.toBeNull();
  });
});
