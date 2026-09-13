import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAccountSummaryDto, StaffInvitationSummaryDto} from "@/features/staff-authentication/application/dto/staff-management-dto";
import type {StaffInvitation} from "@/features/staff-authentication/domain/entities/staff-invitation";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

export type IssuedStaffInvitationToken = Readonly<{
  invitationId: string;
  credential: string;
  lookup: string;
  verification: string;
}>;

export type PresentedStaffInvitationToken = Readonly<{lookup: string; verification: string}>;

export interface StaffInvitationTokenService {
  issue(): IssuedStaffInvitationToken;
  inspect(credential: string): PresentedStaffInvitationToken | null;
  digestsMatch(actual: string, expected: string): boolean;
}

export interface StaffManagementIdGenerator {
  accountId(): string;
  teamMemberId(): string;
}

export type StaffManagementIdentity = Readonly<{
  staffAccountId: string;
  teamMemberId: string;
  role: StaffRole;
  accountActive: boolean;
  teamMemberActive: boolean;
  displayName: string;
}>;

export type StaffManagementTarget = Readonly<{staffAccountId: string; role: StaffRole; active: boolean}>;

export interface StaffManagementRepository {
  createInvitation(input: Readonly<{
    invitation: StaffInvitation;
    authorize(actor: StaffManagementIdentity): boolean;
  }>): Promise<"created" | "invitation_conflict" | "email_conflict" | "forbidden">;
  findInvitationByLookup(lookup: string): Promise<StaffInvitation | null>;
  activateInvitation(input: Readonly<{
    invitationId: string;
    presentedVerification: string;
    normalizedEmail: string;
    passwordHash: string;
    staffAccountId: string;
    teamMemberId: string;
    authorizeCreator(creator: StaffManagementIdentity, targetRole: StaffRole): boolean;
  }>): Promise<"activated" | "invitation_unavailable" | "account_conflict" | "forbidden">;
  listAccounts(): Promise<readonly StaffAccountSummaryDto[]>;
  listInvitations(at: Date): Promise<readonly StaffInvitationSummaryDto[]>;
  revokeInvitation(input: Readonly<{
    actorStaffAccountId: string;
    invitationId: string;
    revokedAt: Date;
    authorize(actor: StaffManagementIdentity, targetRole: StaffRole): boolean;
  }>): Promise<"revoked" | "not_found" | "unavailable" | "forbidden">;
  changeRole(input: Readonly<{
    actorStaffAccountId: string;
    targetStaffAccountId: string;
    newRole: StaffRole;
    changedAt: Date;
    authorize(actor: StaffManagementIdentity, target: StaffManagementTarget): boolean;
  }>): Promise<"changed" | "not_found" | "unchanged" | "forbidden" | "last_super_admin">;
  setActive(input: Readonly<{
    actorStaffAccountId: string;
    targetStaffAccountId: string;
    active: boolean;
    changedAt: Date;
    authorize(actor: StaffManagementIdentity, target: StaffManagementTarget): boolean;
  }>): Promise<"changed" | "not_found" | "unchanged" | "forbidden" | "last_super_admin">;
  bootstrapSuperAdmin(input: Readonly<{targetStaffAccountId: string; changedAt: Date}>): Promise<"promoted" | "not_found" | "ineligible" | "already_bootstrapped">;
}

export function principalFromManagementIdentity(identity: StaffManagementIdentity): StaffPrincipal {
  return Object.freeze({
    staffAccountId: identity.staffAccountId,
    teamMemberId: identity.teamMemberId,
    role: identity.role,
    displayName: identity.displayName,
    actorReference: `staff:${identity.teamMemberId}`,
  });
}
