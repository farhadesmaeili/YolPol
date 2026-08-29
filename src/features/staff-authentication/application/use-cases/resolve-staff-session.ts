import type {StaffClock, StaffSessionRepository, StaffSessionTokenService} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {ResolveStaffSessionResult} from "@/features/staff-authentication/application/results/staff-authentication-results";
import {createStaffPrincipal} from "@/features/staff-authentication/application/use-cases/staff-principal-factory";

const nonMatchingDigest = "0".repeat(64);

export class ResolveStaffSession {
  constructor(
    private readonly sessions: StaffSessionRepository,
    private readonly tokens: StaffSessionTokenService,
    private readonly clock: StaffClock,
  ) {}

  async execute(input: Readonly<{sessionCredential: string; signal?: AbortSignal}>): Promise<ResolveStaffSessionResult> {
    const presented = this.tokens.inspect(input.sessionCredential);
    if (!presented) return {status: "unauthorized"};

    let stored: Awaited<ReturnType<StaffSessionRepository["findByLookup"]>>;
    try { stored = await this.sessions.findByLookup(presented.lookup, input.signal ? {signal: input.signal} : undefined); }
    catch { return {status: "persistence_failed"}; }

    let digestMatches: boolean;
    try { digestMatches = this.tokens.digestsMatch(presented.verification, stored?.session.tokenVerification ?? nonMatchingDigest); }
    catch { return {status: "dependency_failed"}; }
    if (!digestMatches || !stored) {
      return {status: "unauthorized"};
    }

    let now: Date;
    try {
      now = this.clock.now();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return {status: "dependency_failed"};
    } catch { return {status: "dependency_failed"}; }

    if (stored.session.isRevoked() || stored.session.isExpired(now) || !stored.staffAccountActive || !stored.teamMemberActive) {
      return {status: "unauthorized"};
    }

    try { return {status: "authenticated", principal: createStaffPrincipal(stored)}; }
    catch { return {status: "persistence_failed"}; }
  }
}
