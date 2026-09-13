import "server-only";

import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {AuthenticateStaff} from "@/features/staff-authentication/application/use-cases/authenticate-staff";
import {LogoutStaff} from "@/features/staff-authentication/application/use-cases/logout-staff";
import {ResolveStaffSession} from "@/features/staff-authentication/application/use-cases/resolve-staff-session";
import {ResolveStaffConversationActor} from "@/features/staff-authentication/application/use-cases/resolve-staff-conversation-actor";
import {PostgresStaffAccountRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-account-repository";
import {PostgresStaffSessionRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-session-repository";
import {NodeScryptPasswordHasher, staffAuthenticationDummyPasswordHash} from "@/features/staff-authentication/infrastructure/security/node-scrypt-password-hasher";
import {NodeStaffSessionTokenService} from "@/features/staff-authentication/infrastructure/security/staff-session-token-service";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";

export type StaffAuthentication = Readonly<{
  authenticate: AuthenticateStaff;
  resolveSession: ResolveStaffSession;
  logout: LogoutStaff;
  authorization: StaffAuthorizationPolicy;
  resolveConversationActor: ResolveStaffConversationActor;
}>;

let staffAuthentication: StaffAuthentication | undefined;

export function getStaffAuthentication(): StaffAuthentication {
  if (staffAuthentication) return staffAuthentication;
  const pool = getInquiryPostgresPool();
  const accounts = new PostgresStaffAccountRepository(pool);
  const sessions = new PostgresStaffSessionRepository(pool);
  const passwords = new NodeScryptPasswordHasher();
  const tokens = new NodeStaffSessionTokenService();
  const clock = {now: () => new Date()};
  const authorization = new StaffAuthorizationPolicy();
  staffAuthentication = Object.freeze({
    authenticate: new AuthenticateStaff(accounts, sessions, passwords, tokens, clock, staffAuthenticationDummyPasswordHash),
    resolveSession: new ResolveStaffSession(sessions, tokens, clock),
    logout: new LogoutStaff(sessions, tokens, clock),
    authorization,
    resolveConversationActor: new ResolveStaffConversationActor(accounts, authorization),
  });
  return staffAuthentication;
}
