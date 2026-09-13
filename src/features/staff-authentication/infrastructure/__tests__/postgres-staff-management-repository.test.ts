import type {Pool, PoolClient, QueryResult, QueryResultRow} from "pg";
import {describe, expect, it, vi} from "vitest";

import {PostgresStaffManagementRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-management-repository";

const expiresAt = new Date("2026-08-28T10:00:01.000Z");
const invitation = {
  id: "invitation-1",
  normalizedEmail: "invited@example.test",
  displayName: "Invited Staff",
  targetRole: "SALES",
  tokenLookup: "a".repeat(64),
  tokenVerification: "b".repeat(64),
  createdByStaffAccountId: "creator",
  createdAt: new Date("2026-08-28T09:00:00.000Z"),
  expiresAt,
  consumedAt: null,
  revokedAt: null,
};
const creator = {
  staffAccountId: "creator",
  teamMemberId: "creator-member",
  role: "SUPER_ADMIN",
  accountActive: true,
  teamMemberActive: true,
  displayName: "Creator",
};

function result<Row extends QueryResultRow>(rows: readonly Row[] = [], rowCount = rows.length): QueryResult<Row> {
  return {command: "SELECT", rowCount, oid: 0, fields: [], rows: [...rows]};
}

function activation(authoritativeNow: Date) {
  const calls: Array<Readonly<{text: string; values: readonly unknown[]}>> = [];
  const query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
    calls.push({text, values});
    if (/from staff_invitations si[\s\S]*for update of si/u.test(text)) return result([invitation]);
    if (/clock_timestamp\(\)/u.test(text)) return result([{authoritativeNow}]);
    if (/from staff_accounts sa[\s\S]*for update of sa, tm/u.test(text)) return result([creator]);
    if (/select 1 from staff_accounts/u.test(text)) return result([]);
    if (/update staff_invitations set consumed_at/u.test(text)) return result([{id: invitation.id}], 1);
    return result();
  });
  const release = vi.fn();
  const pool = {connect: vi.fn().mockResolvedValue({query, release} as unknown as PoolClient)} as unknown as Pool;
  const repository = new PostgresStaffManagementRepository(pool);
  return {calls, query, release, repository};
}

const input = {
  invitationId: invitation.id,
  presentedVerification: invitation.tokenVerification,
  normalizedEmail: invitation.normalizedEmail,
  passwordHash: "$yolpol-scrypt$v=1$stored-password-hash",
  staffAccountId: "new-account",
  teamMemberId: "new-member",
  authorizeCreator: () => true,
} as const;

describe("PostgresStaffManagementRepository invitation locking and DB time", () => {
  it("locks the invitation before sampling clock_timestamp and uses that one authoritative instant for every activation write", async () => {
    const authoritativeNow = new Date(expiresAt.getTime() - 1);
    const {calls, repository} = activation(authoritativeNow);

    await expect(repository.activateInvitation(input)).resolves.toBe("activated");
    const lockIndex = calls.findIndex(({text}) => /from staff_invitations si[\s\S]*for update of si/u.test(text));
    const timeIndex = calls.findIndex(({text}) => /clock_timestamp\(\)/u.test(text));
    const creatorIndex = calls.findIndex(({text}) => /from staff_accounts sa[\s\S]*for update of sa, tm/u.test(text));
    expect(lockIndex).toBeGreaterThan(-1);
    expect(timeIndex).toBeGreaterThan(lockIndex);
    expect(creatorIndex).toBeGreaterThan(timeIndex);
    expect(calls.filter(({values}) => values.includes(authoritativeNow))).toHaveLength(3);
  });

  it.each([
    ["the exact expiry boundary", expiresAt],
    ["after expiry", new Date(expiresAt.getTime() + 1)],
  ] as const)("rejects neutrally at %s without creating or consuming identities", async (_label, authoritativeNow) => {
    const {calls, repository} = activation(authoritativeNow);

    await expect(repository.activateInvitation(input)).resolves.toBe("invitation_unavailable");
    expect(calls.some(({text}) => /insert into inquiry_team_members|insert into staff_accounts|set consumed_at/u.test(text))).toBe(false);
    expect(calls.some(({text}) => /^rollback$/u.test(text))).toBe(true);
  });

  it("locks an invitation before its actor identity during revocation to match activation ordering", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (text: string) => {
      calls.push(text);
      if (/from staff_invitations where id = \$1 for update/u.test(text)) return result([{targetRole: "SALES", consumedAt: null, revokedAt: null}]);
      if (/from staff_accounts sa[\s\S]*for update of sa, tm/u.test(text)) return result([creator]);
      return result();
    });
    const pool = {connect: vi.fn().mockResolvedValue({query, release: vi.fn()} as unknown as PoolClient)} as unknown as Pool;
    const repository = new PostgresStaffManagementRepository(pool);

    await expect(repository.revokeInvitation({actorStaffAccountId: "creator", invitationId: invitation.id, revokedAt: new Date(), authorize: () => true})).resolves.toBe("revoked");
    expect(calls.findIndex((text) => /from staff_invitations where id = \$1 for update/u.test(text)))
      .toBeLessThan(calls.findIndex((text) => /from staff_accounts sa[\s\S]*for update of sa, tm/u.test(text)));
  });
});

describe("PostgresStaffManagementRepository authorization ordering", () => {
  it.each([
    ["role change", (repository: PostgresStaffManagementRepository, authorize: () => boolean) => repository.changeRole({actorStaffAccountId: "sales", targetStaffAccountId: "sales", newRole: "SALES", changedAt: new Date(), authorize})],
    ["active change", (repository: PostgresStaffManagementRepository, authorize: () => boolean) => repository.setActive({actorStaffAccountId: "sales", targetStaffAccountId: "sales", active: true, changedAt: new Date(), authorize})],
  ] as const)("returns forbidden before revealing that an unauthorized %s would be unchanged", async (_label, execute) => {
    const identity = {
      staffAccountId: "sales",
      teamMemberId: "member-sales",
      role: "SALES",
      accountActive: true,
      teamMemberActive: true,
      displayName: "Sales",
    };
    const query = vi.fn(async (text: string) => /from staff_accounts sa[\s\S]*for update of sa, tm/u.test(text) ? result([identity]) : result());
    const pool = {connect: vi.fn().mockResolvedValue({query, release: vi.fn()} as unknown as PoolClient)} as unknown as Pool;
    const authorize = vi.fn(() => false);

    await expect(execute(new PostgresStaffManagementRepository(pool), authorize)).resolves.toBe("forbidden");
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([text]) => /update staff_accounts|update inquiry_team_members/u.test(text))).toBe(false);
  });
});
