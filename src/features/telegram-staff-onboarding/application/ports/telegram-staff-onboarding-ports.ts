import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import type {TelegramConnectionRequest} from "@/features/telegram-staff-onboarding/domain/entities/telegram-connection-request";
import type {TelegramPrivateChatId, TelegramUserId} from "@/features/telegram-staff-onboarding/domain/value-objects/telegram-identifiers";

export type TelegramStaffIdentity = Readonly<{
  staffAccountId: string;
  teamMemberId: string;
  role: StaffRole;
  accountActive: boolean;
  teamMemberActive: boolean;
  displayName: string;
}>;

export type IssuedTelegramConnectionToken = Readonly<{
  requestId: string;
  credential: string;
  lookup: string;
  verification: string;
}>;

export type PresentedTelegramConnectionToken = Readonly<{lookup: string; verification: string}>;

export interface TelegramConnectionTokenService {
  issue(): IssuedTelegramConnectionToken;
  inspect(credential: string): PresentedTelegramConnectionToken | null;
  digestsMatch(actual: string, expected: string): boolean;
}

export interface TelegramStaffOnboardingClock {
  now(): Date;
}

export interface TelegramStaffOnboardingIdGenerator {
  linkId(): string;
}

export type TelegramOwnConnectionRecord = Readonly<{
  connected: boolean;
  pendingExpiresAt?: Date;
}>;

export interface TelegramStaffOnboardingRepository {
  getOwnConnection(input: Readonly<{
    staffAccountId: string;
    teamMemberId: string;
    authorize(identity: TelegramStaffIdentity): boolean;
  }>): Promise<TelegramOwnConnectionRecord | null>;
  getStaffConnection(input: Readonly<{
    actorStaffAccountId: string;
    targetStaffAccountId: string;
    authorize(actor: TelegramStaffIdentity, target: TelegramStaffIdentity): boolean;
  }>): Promise<TelegramOwnConnectionRecord | null>;
  createConnectionRequest(input: Readonly<{
    request: TelegramConnectionRequest;
    authorize(identity: TelegramStaffIdentity): boolean;
  }>): Promise<"created" | "unavailable">;
  consumeConnectionRequest(input: Readonly<{
    linkId: string;
    lookup: string;
    presentedVerification: string;
    telegramUserId: TelegramUserId;
    privateChatId: TelegramPrivateChatId;
    digestsMatch(actual: string, expected: string): boolean;
    authorizeOwner(identity: TelegramStaffIdentity): boolean;
  }>): Promise<"connected" | "unavailable">;
  disconnectOwn(input: Readonly<{
    staffAccountId: string;
    teamMemberId: string;
    authorize(identity: TelegramStaffIdentity): boolean;
  }>): Promise<"disconnected" | "unavailable">;
  forceDisconnect(input: Readonly<{
    actorStaffAccountId: string;
    targetStaffAccountId: string;
    authorize(actor: TelegramStaffIdentity, target: TelegramStaffIdentity): boolean;
  }>): Promise<"disconnected" | "unavailable">;
  revokeOwnRequest(input: Readonly<{
    staffAccountId: string;
    teamMemberId: string;
    authorize(identity: TelegramStaffIdentity): boolean;
  }>): Promise<"revoked" | "unavailable">;
  revokeStaffRequest(input: Readonly<{
    actorStaffAccountId: string;
    targetStaffAccountId: string;
    authorize(actor: TelegramStaffIdentity, target: TelegramStaffIdentity): boolean;
  }>): Promise<"revoked" | "unavailable">;
  findActorByTelegramUserId(telegramUserId: TelegramUserId): Promise<TelegramStaffIdentity | null>;
}

export function principalFromTelegramIdentity(identity: TelegramStaffIdentity): StaffPrincipal {
  return Object.freeze({
    staffAccountId: identity.staffAccountId,
    teamMemberId: identity.teamMemberId,
    role: identity.role,
    displayName: identity.displayName,
    actorReference: `staff:${identity.teamMemberId}`,
  });
}
