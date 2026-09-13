import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization, StaffClock} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {principalFromManagementIdentity, type StaffInvitationTokenService, type StaffManagementRepository} from "@/features/staff-authentication/application/ports/staff-management-ports";
import {StaffInvitation} from "@/features/staff-authentication/domain/entities/staff-invitation";
import {parseStaffRole, type StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffDisplayName} from "@/features/staff-authentication/domain/value-objects/staff-display-name";
import {StaffEmail} from "@/features/staff-authentication/domain/value-objects/staff-email";

export const staffInvitationLifetimeMs = 24 * 60 * 60 * 1_000;

export type CreateStaffInvitationResult =
  | Readonly<{status: "created"; invitationId: string; activationCode: string; expiresAt: string}>
  | Readonly<{status: "validation_failed"; field: "displayName" | "email" | "targetRole"}>
  | Readonly<{status: "forbidden" | "invitation_conflict" | "email_conflict" | "persistence_failed" | "dependency_failed"}>;

export class CreateStaffInvitation {
  constructor(
    private readonly repository: StaffManagementRepository,
    private readonly tokens: StaffInvitationTokenService,
    private readonly authorization: StaffAuthorization,
    private readonly clock: StaffClock,
  ) {}

  async execute(input: Readonly<{principal: StaffPrincipal; displayName: unknown; email: unknown; targetRole: unknown}>): Promise<CreateStaffInvitationResult> {
    let displayName: string;
    let normalizedEmail: string;
    let targetRole: StaffRole;
    try { displayName = StaffDisplayName.create(input.displayName).value; }
    catch { return {status: "validation_failed", field: "displayName"}; }
    try { normalizedEmail = StaffEmail.create(input.email).value; }
    catch { return {status: "validation_failed", field: "email"}; }
    try { targetRole = parseStaffRole(input.targetRole); }
    catch { return {status: "validation_failed", field: "targetRole"}; }
    if (targetRole === "SUPER_ADMIN") return {status: "forbidden"};
    if (!this.authorization.mayCreateStaffInvitation(input.principal, targetRole)) return {status: "forbidden"};

    let issued: ReturnType<StaffInvitationTokenService["issue"]>;
    let invitation: StaffInvitation;
    try {
      const now = this.clock.now();
      issued = this.tokens.issue();
      invitation = StaffInvitation.create({
        id: issued.invitationId,
        normalizedEmail,
        displayName,
        targetRole,
        tokenLookup: issued.lookup,
        tokenVerification: issued.verification,
        createdByStaffAccountId: input.principal.staffAccountId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + staffInvitationLifetimeMs),
      });
    } catch { return {status: "dependency_failed"}; }

    try {
      const result = await this.repository.createInvitation({
        invitation,
        authorize: (actor) => this.authorization.mayCreateStaffInvitation(principalFromManagementIdentity(actor), targetRole),
      });
      if (result !== "created") return {status: result};
      return Object.freeze({status: "created", invitationId: invitation.id, activationCode: issued.credential, expiresAt: invitation.expiresAt.toISOString()});
    } catch { return {status: "persistence_failed"}; }
  }
}
