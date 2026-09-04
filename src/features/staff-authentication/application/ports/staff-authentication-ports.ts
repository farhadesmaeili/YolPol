import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAccount} from "@/features/staff-authentication/domain/entities/staff-account";
import type {StaffSession} from "@/features/staff-authentication/domain/entities/staff-session";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import type {StaffCapabilities} from "@/features/staff-authentication/application/dto/staff-capabilities";

export type StaffAccountAuthenticationRecord = Readonly<{
  account: StaffAccount;
  teamMemberActive: boolean;
  teamMemberDisplayName: string;
}>;

export type StoredStaffSession = Readonly<{
  session: StaffSession;
  staffAccountId: string;
  teamMemberId: string;
  role: StaffRole;
  staffAccountActive: boolean;
  teamMemberActive: boolean;
  teamMemberDisplayName: string;
}>;

export type CurrentStaffAuthorizationRecord = Omit<StoredStaffSession, "session">;

export type IssuedStaffSessionToken = Readonly<{
  sessionId: string;
  credential: string;
  lookup: string;
  verification: string;
}>;

export type PresentedStaffSessionToken = Readonly<{lookup: string; verification: string}>;

export interface StaffAccountRepository {
  findByNormalizedEmail(normalizedEmail: string): Promise<StaffAccountAuthenticationRecord | null>;
  findAuthorizationByTeamMemberId(teamMemberId: string): Promise<CurrentStaffAuthorizationRecord | null>;
}

export interface StaffSessionRepository {
  create(session: StaffSession): Promise<void>;
  findByLookup(lookup: string, options?: Readonly<{signal?: AbortSignal}>): Promise<StoredStaffSession | null>;
  revokeById(sessionId: string, revokedAt: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string): Promise<boolean>;
}

export interface StaffSessionTokenService {
  issue(): IssuedStaffSessionToken;
  inspect(credential: string): PresentedStaffSessionToken | null;
  digestsMatch(actual: string, expected: string): boolean;
}

export interface StaffClock {
  now(): Date;
}

export interface StaffAuthorization {
  capabilitiesFor(principal: StaffPrincipal): StaffCapabilities;
  mayAccessStaffPanel(principal: StaffPrincipal): boolean;
  mayViewInquiries(principal: StaffPrincipal): boolean;
  mayViewCustomerConversation(principal: StaffPrincipal): boolean;
  mayReplyToCustomerConversation(principal: StaffPrincipal): boolean;
  mayControlConversationAi(principal: StaffPrincipal): boolean;
  mayPublishStaffTyping(principal: StaffPrincipal): boolean;
  mayUpdateInquiryWorkflow(principal: StaffPrincipal): boolean;
  mayViewAiOperations(principal: StaffPrincipal): boolean;
  mayManageAiOperations(principal: StaffPrincipal): boolean;
  mayViewAiProviderRegistry(principal: StaffPrincipal): boolean;
  mayManageAiProviders(principal: StaffPrincipal): boolean;
  mayManageAiCredentialReferences(principal: StaffPrincipal): boolean;
  mayManageTeam(principal: StaffPrincipal): boolean;
  mayCreateStaffInvitation(principal: StaffPrincipal, targetRole: StaffRole): boolean;
  mayDeactivateStaffMember(principal: StaffPrincipal, target: Readonly<{staffAccountId: string; role: StaffRole; active: boolean}>): boolean;
  mayReactivateStaffMember(principal: StaffPrincipal, target: Readonly<{staffAccountId: string; role: StaffRole; active: boolean}>): boolean;
  mayChangeStaffRole(principal: StaffPrincipal, target: Readonly<{staffAccountId: string; role: StaffRole; active: boolean}>, newRole: StaffRole): boolean;
  mayAssignAdminRole(principal: StaffPrincipal): boolean;
  mayAssignSuperAdminRole(principal: StaffPrincipal): boolean;
  actorReferenceFor(principal: StaffPrincipal): string;
}
