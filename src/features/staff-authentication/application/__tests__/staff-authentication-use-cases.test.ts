import {describe, expect, it, vi} from "vitest";

import {StaffAuthorizationPolicy, deriveStaffActorReference} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {AuthenticateStaff, staffSessionLifetimeMs} from "@/features/staff-authentication/application/use-cases/authenticate-staff";
import {LogoutStaff} from "@/features/staff-authentication/application/use-cases/logout-staff";
import {ResolveStaffSession} from "@/features/staff-authentication/application/use-cases/resolve-staff-session";
import {StaffSession} from "@/features/staff-authentication/domain/entities/staff-session";
import {FakePasswordHasher, FakeStaffAccountRepository, FakeStaffSessionRepository, FakeStaffSessionTokenService, staffAuthenticationRecord, staffSessionAuthorizationRecord} from "@/features/staff-authentication/testing/fakes/staff-authentication-fakes";

const now = new Date("2026-08-25T10:00:00.000Z");
const clock = {now: () => new Date(now)};
const dummyHash = "hash:not-the-presented-password";

function createAuthentication(record: ReturnType<typeof staffAuthenticationRecord> | null = staffAuthenticationRecord()) {
  const accounts = new FakeStaffAccountRepository(record);
  const sessions = new FakeStaffSessionRepository();
  const passwords = new FakePasswordHasher();
  const tokens = new FakeStaffSessionTokenService();
  return {accounts, sessions, passwords, tokens, authenticate: new AuthenticateStaff(accounts, sessions, passwords, tokens, clock, dummyHash)};
}

describe("AuthenticateStaff", () => {
  it("authenticates current active identities and persists only session digest material", async () => {
    const context = createAuthentication();
    const result = await context.authenticate.execute({email: " Staff@Example.com ", password: "correct-password"});
    expect(result).toMatchObject({status: "authenticated", principal: {staffAccountId: "account-1", teamMemberId: "member-1", role: "SALES", displayName: "Staff Member", actorReference: "staff:member-1"}});
    expect(context.sessions.sessions).toHaveLength(1);
    const session = context.sessions.sessions[0]!;
    expect(session.tokenLookup).toBe("a".repeat(64));
    expect(session.tokenVerification).toBe("b".repeat(64));
    expect(JSON.stringify(session)).not.toContain("yps_");
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBe(staffSessionLifetimeMs);
  });

  it("uses the same generic result and a real password verification for every credential failure", async () => {
    const cases = [
      {record: null, email: "unknown@example.com", password: "wrong", expectedHash: dummyHash},
      {record: staffAuthenticationRecord(), email: "staff@example.com", password: "wrong", expectedHash: "hash:correct-password"},
      {record: staffAuthenticationRecord({accountActive: false}), email: "staff@example.com", password: "correct-password", expectedHash: "hash:correct-password"},
      {record: staffAuthenticationRecord({teamMemberActive: false}), email: "staff@example.com", password: "correct-password", expectedHash: "hash:correct-password"},
    ] as const;
    for (const testCase of cases) {
      const context = createAuthentication(testCase.record);
      await expect(context.authenticate.execute({email: testCase.email, password: testCase.password})).resolves.toEqual({status: "authentication_failed"});
      expect(context.passwords.verifiedHashes).toEqual([testCase.expectedHash]);
      expect(context.sessions.sessions).toHaveLength(0);
    }
  });
});

describe("staff session use cases", () => {
  function storedSession(overrides: Partial<Readonly<{expiresAt: Date; revokedAt: Date}>> = {}) {
    return StaffSession.reconstitute({
      id: "session-1",
      staffAccountId: "account-1",
      tokenLookup: "a".repeat(64),
      tokenVerification: "b".repeat(64),
      createdAt: new Date(now.getTime() - 1_000),
      expiresAt: overrides.expiresAt ?? new Date(now.getTime() + 1_000),
      ...(overrides.revokedAt ? {revokedAt: overrides.revokedAt} : {}),
    });
  }

  it("resolves a valid staff token and rejects token-type confusion, unknown, expired, and revoked sessions", async () => {
    const tokens = new FakeStaffSessionTokenService();
    const sessions = new FakeStaffSessionRepository();
    sessions.sessions.push(storedSession());
    const resolver = new ResolveStaffSession(sessions, tokens, clock);
    await expect(resolver.execute({sessionCredential: `yps_${"A".repeat(43)}`})).resolves.toMatchObject({status: "authenticated", principal: {actorReference: "staff:member-1"}});
    await expect(resolver.execute({sessionCredential: `ypc_${"A".repeat(43)}`})).resolves.toEqual({status: "unauthorized"});
    await expect(resolver.execute({sessionCredential: "malformed"})).resolves.toEqual({status: "unauthorized"});
    sessions.sessions.length = 0;
    await expect(resolver.execute({sessionCredential: `yps_${"A".repeat(43)}`})).resolves.toEqual({status: "unauthorized"});
    sessions.sessions.push(storedSession({expiresAt: now}));
    await expect(resolver.execute({sessionCredential: `yps_${"A".repeat(43)}`})).resolves.toEqual({status: "unauthorized"});
    sessions.sessions[0] = storedSession({revokedAt: new Date(now.getTime() - 500)});
    await expect(resolver.execute({sessionCredential: `yps_${"A".repeat(43)}`})).resolves.toEqual({status: "unauthorized"});
  });

  it("checks current account and team-member state after session creation", async () => {
    const tokens = new FakeStaffSessionTokenService();
    const session = storedSession();
    for (const record of [staffSessionAuthorizationRecord({accountActive: false}), staffSessionAuthorizationRecord({teamMemberActive: false})]) {
      const sessions = new FakeStaffSessionRepository();
      sessions.sessions.push(session);
      sessions.findByLookup = async () => ({...record, session});
      await expect(new ResolveStaffSession(sessions, tokens, clock).execute({sessionCredential: `yps_${"A".repeat(43)}`})).resolves.toEqual({status: "unauthorized"});
    }
  });

  it("passes cancellation through to the Staff session repository", async () => {
    const tokens = new FakeStaffSessionTokenService();
    const sessions = new FakeStaffSessionRepository();
    sessions.sessions.push(storedSession());
    const findByLookup = vi.spyOn(sessions, "findByLookup");
    const abort = new AbortController();

    await expect(new ResolveStaffSession(sessions, tokens, clock).execute({sessionCredential: `yps_${"A".repeat(43)}`, signal: abort.signal})).resolves.toMatchObject({status: "authenticated"});
    expect(findByLookup).toHaveBeenCalledWith("a".repeat(64), {signal: abort.signal});
  });

  it("revokes logout server-side and remains idempotent", async () => {
    const sessions = new FakeStaffSessionRepository();
    sessions.sessions.push(storedSession());
    const logout = new LogoutStaff(sessions, new FakeStaffSessionTokenService(), clock);
    await expect(logout.execute({sessionCredential: `yps_${"A".repeat(43)}`})).resolves.toEqual({status: "completed"});
    expect(sessions.sessions[0]?.isRevoked()).toBe(true);
    await expect(logout.execute({sessionCredential: `yps_${"A".repeat(43)}`})).resolves.toEqual({status: "completed"});
    await expect(logout.execute({sessionCredential: "unknown"})).resolves.toEqual({status: "completed"});
  });
});

describe("StaffAuthorizationPolicy", () => {
  const principal = (role: "SUPER_ADMIN" | "ADMIN" | "SALES" | "VIEWER") => ({staffAccountId: "account-1", teamMemberId: "member-1", role, displayName: "Staff", actorReference: deriveStaffActorReference("member-1")});

  it.each([
    ["SUPER_ADMIN", true, true, true],
    ["ADMIN", true, true, true],
    ["SALES", true, true, false],
    ["VIEWER", true, false, false],
  ] as const)("maps %s to the centralized capabilities", (role, mayView, mayWrite, mayManageTeam) => {
    const policy = new StaffAuthorizationPolicy();
    const capabilities = policy.capabilitiesFor(principal(role));
    expect(capabilities).toEqual({
      mayAccessStaffPanel: true,
      mayViewInquiries: mayView,
      mayViewCustomerConversation: mayView,
      mayReplyToCustomerConversation: mayWrite,
      mayControlConversationAi: mayWrite,
      mayPublishStaffTyping: mayWrite,
      mayUpdateInquiryWorkflow: mayWrite,
      mayViewAiOperations: true,
      mayManageAiOperations: mayManageTeam,
      mayViewAiProviderRegistry: true,
      mayManageAiProviders: mayManageTeam,
      mayManageAiCredentialReferences: role === "SUPER_ADMIN",
      mayManageTeam,
      mayCreateStaffInvitation: mayManageTeam,
      mayDeactivateStaffMember: mayManageTeam,
      mayReactivateStaffMember: mayManageTeam,
      mayChangeStaffRole: mayManageTeam,
      mayAssignAdminRole: role === "SUPER_ADMIN",
      mayAssignSuperAdminRole: role === "SUPER_ADMIN",
    });
  });

  it("enforces invitation, target-role, self-target, and active Super Admin promotion rules", () => {
    const policy = new StaffAuthorizationPolicy();
    const superAdmin = principal("SUPER_ADMIN");
    const admin = principal("ADMIN");
    const salesTarget = {staffAccountId: "account-2", role: "SALES" as const, active: true};
    expect(policy.mayCreateStaffInvitation(superAdmin, "ADMIN")).toBe(true);
    expect(policy.mayCreateStaffInvitation(superAdmin, "SUPER_ADMIN")).toBe(false);
    expect(policy.mayCreateStaffInvitation(admin, "SALES")).toBe(true);
    expect(policy.mayCreateStaffInvitation(admin, "ADMIN")).toBe(false);
    expect(policy.mayChangeStaffRole(superAdmin, salesTarget, "SUPER_ADMIN")).toBe(true);
    expect(policy.mayChangeStaffRole(superAdmin, {...salesTarget, active: false}, "SUPER_ADMIN")).toBe(false);
    expect(policy.mayChangeStaffRole(admin, salesTarget, "VIEWER")).toBe(true);
    expect(policy.mayChangeStaffRole(admin, salesTarget, "ADMIN")).toBe(false);
    expect(policy.mayChangeStaffRole(admin, {...salesTarget, role: "ADMIN"}, "SALES")).toBe(false);
    expect(policy.mayChangeStaffRole(admin, {...salesTarget, role: "SUPER_ADMIN"}, "SALES")).toBe(false);
    expect(policy.mayDeactivateStaffMember(admin, {...salesTarget, staffAccountId: admin.staffAccountId})).toBe(false);
    expect(policy.mayReactivateStaffMember(admin, {...salesTarget, staffAccountId: admin.staffAccountId, active: false})).toBe(false);
    expect(policy.mayChangeStaffRole(admin, {...salesTarget, staffAccountId: admin.staffAccountId}, "VIEWER")).toBe(false);
    expect(policy.mayDeactivateStaffMember(admin, {...salesTarget, role: "ADMIN"})).toBe(false);
    expect(policy.mayDeactivateStaffMember(admin, {...salesTarget, role: "SUPER_ADMIN"})).toBe(false);
    expect(policy.mayChangeStaffRole(superAdmin, {...salesTarget, role: "SUPER_ADMIN"}, "ADMIN")).toBe(true);
    expect(policy.mayChangeStaffRole(superAdmin, {...salesTarget, role: "ADMIN"}, "SALES")).toBe(true);
    expect(policy.mayChangeStaffRole(superAdmin, {...salesTarget, role: "VIEWER"}, "SALES")).toBe(true);
  });

  it("derives actor identity and rejects malformed or client-forged principals", () => {
    const policy = new StaffAuthorizationPolicy();
    const admin = principal("ADMIN");
    expect(policy.actorReferenceFor(admin)).toBe("staff:member-1");
    expect(policy.mayAccessStaffPanel({...admin, role: "OWNER" as never})).toBe(false);
    expect(policy.mayReplyToCustomerConversation({...admin, role: "OWNER" as never})).toBe(false);
    expect(policy.mayViewAiOperations({...admin, actorReference: "browser:override"})).toBe(false);
    expect(policy.mayManageAiOperations(principal("SALES"))).toBe(false);
    expect(policy.mayAccessStaffPanel({...admin, actorReference: "browser:override"})).toBe(false);
  });
});
