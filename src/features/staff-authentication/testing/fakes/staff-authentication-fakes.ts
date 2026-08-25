import type {StaffAccountAuthenticationRecord, StaffAccountRepository, PasswordHasher, StaffSessionRepository, StaffSessionTokenService} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {StaffAccount} from "@/features/staff-authentication/domain/entities/staff-account";
import type {StaffSession} from "@/features/staff-authentication/domain/entities/staff-session";

const baseTime = new Date("2026-08-25T08:00:00.000Z");

export function staffAuthenticationRecord(overrides: Partial<Readonly<{accountActive: boolean; teamMemberActive: boolean; role: "ADMIN" | "SALES"}>> = {}): StaffAccountAuthenticationRecord {
  return Object.freeze({
    account: StaffAccount.reconstitute({
      id: "account-1",
      teamMemberId: "member-1",
      normalizedEmail: "staff@example.com",
      passwordHash: "hash:correct-password",
      role: overrides.role ?? "SALES",
      active: overrides.accountActive ?? true,
      createdAt: baseTime,
      updatedAt: baseTime,
    }),
    teamMemberActive: overrides.teamMemberActive ?? true,
    teamMemberDisplayName: "Staff Member",
  });
}

export function staffSessionAuthorizationRecord(overrides: Partial<Readonly<{accountActive: boolean; teamMemberActive: boolean; role: "ADMIN" | "SALES"}>> = {}) {
  const authentication = staffAuthenticationRecord(overrides);
  return Object.freeze({
    staffAccountId: authentication.account.id,
    teamMemberId: authentication.account.teamMemberId,
    role: authentication.account.role,
    staffAccountActive: authentication.account.active,
    teamMemberActive: authentication.teamMemberActive,
    teamMemberDisplayName: authentication.teamMemberDisplayName,
  });
}

export class FakeStaffAccountRepository implements StaffAccountRepository {
  constructor(public record: StaffAccountAuthenticationRecord | null = staffAuthenticationRecord()) {}
  async findByNormalizedEmail(normalizedEmail: string) { return normalizedEmail === "staff@example.com" ? this.record : null; }
}

export class FakePasswordHasher implements PasswordHasher {
  readonly verifiedHashes: string[] = [];
  async hash(password: string): Promise<string> { return `hash:${password}`; }
  async verify(password: string, storedHash: string): Promise<boolean> {
    this.verifiedHashes.push(storedHash);
    return storedHash === `hash:${password}`;
  }
}

export class FakeStaffSessionTokenService implements StaffSessionTokenService {
  issue() { return {sessionId: "session-1", credential: `yps_${"A".repeat(43)}`, lookup: "a".repeat(64), verification: "b".repeat(64)}; }
  inspect(credential: string) { return credential === `yps_${"A".repeat(43)}` ? {lookup: "a".repeat(64), verification: "b".repeat(64)} : null; }
  digestsMatch(actual: string, expected: string) { return actual === expected; }
}

export class FakeStaffSessionRepository implements StaffSessionRepository {
  readonly sessions: StaffSession[] = [];
  async create(session: StaffSession): Promise<void> { this.sessions.push(session); }
  async findByLookup(lookup: string) {
    const session = this.sessions.find((candidate) => candidate.tokenLookup === lookup);
    return session ? {...staffSessionAuthorizationRecord(), session} : null;
  }
  async revokeById(sessionId: string, revokedAt: Date): Promise<void> {
    const index = this.sessions.findIndex((candidate) => candidate.id === sessionId);
    const current = this.sessions[index];
    if (!current) return;
    const {StaffSession} = await import("@/features/staff-authentication/domain/entities/staff-session");
    this.sessions[index] = StaffSession.reconstitute({
      id: current.id,
      staffAccountId: current.staffAccountId,
      tokenLookup: current.tokenLookup,
      tokenVerification: current.tokenVerification,
      createdAt: current.createdAt,
      expiresAt: current.expiresAt,
      revokedAt,
    });
  }
}
