import type {StaffClock, StaffSessionRepository, StaffSessionTokenService} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {LogoutStaffResult} from "@/features/staff-authentication/application/results/staff-authentication-results";

const nonMatchingDigest = "0".repeat(64);

export class LogoutStaff {
  constructor(
    private readonly sessions: StaffSessionRepository,
    private readonly tokens: StaffSessionTokenService,
    private readonly clock: StaffClock,
  ) {}

  async execute(input: Readonly<{sessionCredential: string}>): Promise<LogoutStaffResult> {
    const presented = this.tokens.inspect(input.sessionCredential);
    if (!presented) return {status: "completed"};

    let stored: Awaited<ReturnType<StaffSessionRepository["findByLookup"]>>;
    try { stored = await this.sessions.findByLookup(presented.lookup); }
    catch { return {status: "persistence_failed"}; }
    let digestMatches: boolean;
    try { digestMatches = this.tokens.digestsMatch(presented.verification, stored?.session.tokenVerification ?? nonMatchingDigest); }
    catch { return {status: "dependency_failed"}; }
    if (!digestMatches || !stored) {
      return {status: "completed"};
    }

    let now: Date;
    try {
      now = this.clock.now();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return {status: "dependency_failed"};
    } catch { return {status: "dependency_failed"}; }

    try { await this.sessions.revokeById(stored.session.id, now); }
    catch { return {status: "persistence_failed"}; }
    return {status: "completed"};
  }
}
