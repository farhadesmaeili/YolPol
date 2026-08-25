import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAccount} from "@/features/staff-authentication/domain/entities/staff-account";
import type {StaffSession} from "@/features/staff-authentication/domain/entities/staff-session";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

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

export type IssuedStaffSessionToken = Readonly<{
  sessionId: string;
  credential: string;
  lookup: string;
  verification: string;
}>;

export type PresentedStaffSessionToken = Readonly<{lookup: string; verification: string}>;

export interface StaffAccountRepository {
  findByNormalizedEmail(normalizedEmail: string): Promise<StaffAccountAuthenticationRecord | null>;
}

export interface StaffSessionRepository {
  create(session: StaffSession): Promise<void>;
  findByLookup(lookup: string): Promise<StoredStaffSession | null>;
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
  mayPerformTeamOperations(principal: StaffPrincipal): boolean;
  actorReferenceFor(principal: StaffPrincipal): string;
}
