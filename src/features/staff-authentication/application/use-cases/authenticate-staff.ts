import type {StaffAccountRepository, StaffClock, PasswordHasher, StaffSessionRepository, StaffSessionTokenService} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {AuthenticateStaffResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {createStaffPrincipal} from "@/features/staff-authentication/application/use-cases/staff-principal-factory";
import {StaffSession} from "@/features/staff-authentication/domain/entities/staff-session";
import {StaffEmail} from "@/features/staff-authentication/domain/value-objects/staff-email";

export const staffSessionLifetimeMs = 8 * 60 * 60 * 1_000;

export class AuthenticateStaff {
  constructor(
    private readonly accounts: StaffAccountRepository,
    private readonly sessions: StaffSessionRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: StaffSessionTokenService,
    private readonly clock: StaffClock,
    private readonly dummyPasswordHash: string,
  ) {}

  async execute(input: Readonly<{email: string; password: string}>): Promise<AuthenticateStaffResult> {
    let normalizedEmail: string;
    try { normalizedEmail = StaffEmail.create(input.email).value; }
    catch { normalizedEmail = "__invalid_staff_email__"; }

    let record: Awaited<ReturnType<StaffAccountRepository["findByNormalizedEmail"]>>;
    try { record = await this.accounts.findByNormalizedEmail(normalizedEmail); }
    catch { return {status: "persistence_failed"}; }

    let passwordMatches: boolean;
    try { passwordMatches = await this.passwords.verify(input.password, record?.account.passwordHash ?? this.dummyPasswordHash); }
    catch { return {status: "dependency_failed"}; }

    if (!passwordMatches || !record || !record.account.active || !record.teamMemberActive) return {status: "authentication_failed"};

    let now: Date;
    try {
      now = this.clock.now();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return {status: "dependency_failed"};
    } catch { return {status: "dependency_failed"}; }

    let issued: ReturnType<StaffSessionTokenService["issue"]>;
    let principal: ReturnType<typeof createStaffPrincipal>;
    let session: StaffSession;
    const expiresAt = new Date(now.getTime() + staffSessionLifetimeMs);
    try {
      issued = this.tokens.issue();
      principal = createStaffPrincipal({
        staffAccountId: record.account.id,
        teamMemberId: record.account.teamMemberId,
        role: record.account.role,
        teamMemberDisplayName: record.teamMemberDisplayName,
      });
      session = StaffSession.reconstitute({
        id: issued.sessionId,
        staffAccountId: record.account.id,
        tokenLookup: issued.lookup,
        tokenVerification: issued.verification,
        createdAt: now,
        expiresAt,
      });
    } catch { return {status: "dependency_failed"}; }

    try { await this.sessions.create(session); }
    catch { return {status: "persistence_failed"}; }
    return {status: "authenticated", principal, sessionCredential: issued.credential, expiresAt};
  }
}
