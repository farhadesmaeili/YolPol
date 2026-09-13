import type {PasswordHasher, StaffAuthorization, StaffClock} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {principalFromManagementIdentity, type StaffInvitationTokenService, type StaffManagementIdGenerator, type StaffManagementRepository} from "@/features/staff-authentication/application/ports/staff-management-ports";
import {StaffEmail} from "@/features/staff-authentication/domain/value-objects/staff-email";
import {StaffPassword} from "@/features/staff-authentication/domain/value-objects/staff-password";

export type ActivateStaffInvitationResult =
  | Readonly<{status: "activated"}>
  | Readonly<{status: "validation_failed"; field: "activationCode" | "password"}>
  | Readonly<{status: "invitation_unavailable" | "account_conflict" | "persistence_failed" | "dependency_failed"}>;

export class ActivateStaffInvitation {
  constructor(
    private readonly repository: StaffManagementRepository,
    private readonly tokens: StaffInvitationTokenService,
    private readonly passwords: PasswordHasher,
    private readonly ids: StaffManagementIdGenerator,
    private readonly authorization: StaffAuthorization,
    private readonly clock: StaffClock,
  ) {}

  async execute(input: Readonly<{email: unknown; activationCode: unknown; password: unknown}>): Promise<ActivateStaffInvitationResult> {
    let normalizedEmail: string;
    let password: string;
    try { normalizedEmail = StaffEmail.create(input.email).value; }
    catch { return {status: "invitation_unavailable"}; }
    if (typeof input.activationCode !== "string") return {status: "validation_failed", field: "activationCode"};
    const presented = this.tokens.inspect(input.activationCode.trim());
    if (!presented) return {status: "invitation_unavailable"};
    try { password = StaffPassword.create(input.password).value; }
    catch { return {status: "validation_failed", field: "password"}; }

    let invitation: Awaited<ReturnType<StaffManagementRepository["findInvitationByLookup"]>>;
    let preliminaryNow: Date;
    try {
      invitation = await this.repository.findInvitationByLookup(presented.lookup);
      preliminaryNow = this.clock.now();
    } catch { return {status: "persistence_failed"}; }
    if (!invitation || invitation.normalizedEmail !== normalizedEmail || !invitation.isAvailable(preliminaryNow)) return {status: "invitation_unavailable"};
    try {
      if (!this.tokens.digestsMatch(presented.verification, invitation.tokenVerification)) return {status: "invitation_unavailable"};
    } catch { return {status: "dependency_failed"}; }

    let passwordHash: string;
    let staffAccountId: string;
    let teamMemberId: string;
    try {
      passwordHash = await this.passwords.hash(password);
      staffAccountId = this.ids.accountId();
      teamMemberId = this.ids.teamMemberId();
    } catch { return {status: "dependency_failed"}; }

    try {
      const result = await this.repository.activateInvitation({
        invitationId: invitation.id,
        presentedVerification: presented.verification,
        normalizedEmail,
        passwordHash,
        staffAccountId,
        teamMemberId,
        authorizeCreator: (creator, targetRole) => this.authorization.mayCreateStaffInvitation(principalFromManagementIdentity(creator), targetRole),
      });
      if (result === "activated") return {status: "activated"};
      if (result === "account_conflict") return {status: "account_conflict"};
      return {status: "invitation_unavailable"};
    } catch { return {status: "persistence_failed"}; }
  }
}
