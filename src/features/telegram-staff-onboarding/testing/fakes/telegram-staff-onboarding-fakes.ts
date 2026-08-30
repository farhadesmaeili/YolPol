import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import type {TelegramConnectionRequest} from "@/features/telegram-staff-onboarding/domain/entities/telegram-connection-request";
import type {TelegramConnectionTokenService, TelegramStaffIdentity, TelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";

export const telegramTestNow = new Date("2026-08-30T08:00:00.000Z");

export function telegramIdentity(role: StaffRole = "SALES", suffix = role.toLowerCase(), overrides: Partial<TelegramStaffIdentity> = {}): TelegramStaffIdentity {
  return Object.freeze({
    staffAccountId: `account-${suffix}`,
    teamMemberId: `member-${suffix}`,
    role,
    accountActive: true,
    teamMemberActive: true,
    displayName: `${role} Member`,
    ...overrides,
  });
}

export function telegramPrincipal(identity: TelegramStaffIdentity): StaffPrincipal {
  return Object.freeze({
    staffAccountId: identity.staffAccountId,
    teamMemberId: identity.teamMemberId,
    role: identity.role,
    displayName: identity.displayName,
    actorReference: `staff:${identity.teamMemberId}`,
  });
}

export class FakeTelegramConnectionTokenService implements TelegramConnectionTokenService {
  readonly credential = `ypt_${"A".repeat(43)}`;
  issue() { return {requestId: "telegram-request-1", credential: this.credential, lookup: "a".repeat(64), verification: "b".repeat(64)}; }
  inspect(credential: string) { return credential === this.credential ? {lookup: "a".repeat(64), verification: "b".repeat(64)} : null; }
  digestsMatch(actual: string, expected: string) { return actual === expected; }
}

type StoredRequest = {request: TelegramConnectionRequest; consumed: boolean; revoked: boolean};

export class FakeTelegramStaffOnboardingRepository implements TelegramStaffOnboardingRepository {
  readonly identities = new Map<string, TelegramStaffIdentity>();
  readonly requests: StoredRequest[] = [];
  readonly activeUsersByTeamMember = new Map<string, string>();
  readonly historicalOwnersByUser = new Map<string, string>();
  readonly privateChatsByUser = new Map<string, string>();
  now = telegramTestNow;
  authorizationChecks = 0;
  stateReads = 0;

  addIdentity(identity: TelegramStaffIdentity): this {
    this.identities.set(identity.staffAccountId, identity);
    return this;
  }

  async getOwnConnection(input: Parameters<TelegramStaffOnboardingRepository["getOwnConnection"]>[0]) {
    const owner = this.identities.get(input.staffAccountId);
    if (!owner || owner.teamMemberId !== input.teamMemberId || !input.authorize(owner)) return null;
    const pending = this.requests.find(({request, consumed, revoked}) => request.staffAccountId === owner.staffAccountId && !consumed && !revoked && request.expiresAt > this.now);
    return {connected: this.activeUsersByTeamMember.has(owner.teamMemberId), pendingExpiresAt: pending?.request.expiresAt};
  }

  async getStaffConnection(input: Parameters<TelegramStaffOnboardingRepository["getStaffConnection"]>[0]) {
    const actor = this.identities.get(input.actorStaffAccountId);
    const target = this.identities.get(input.targetStaffAccountId);
    this.authorizationChecks += 1;
    if (!actor || !target || !input.authorize(actor, target)) return null;
    this.stateReads += 1;
    const pending = this.requests.find(({request, consumed, revoked}) => request.staffAccountId === target.staffAccountId && !consumed && !revoked && request.expiresAt > this.now);
    return {connected: this.activeUsersByTeamMember.has(target.teamMemberId), pendingExpiresAt: pending?.request.expiresAt};
  }

  async createConnectionRequest(input: Parameters<TelegramStaffOnboardingRepository["createConnectionRequest"]>[0]) {
    const owner = this.identities.get(input.request.staffAccountId);
    if (!owner || owner.teamMemberId !== input.request.teamMemberId || !input.authorize(owner)) return "unavailable" as const;
    for (const stored of this.requests) if (stored.request.staffAccountId === owner.staffAccountId && !stored.consumed && !stored.revoked) stored.revoked = true;
    this.requests.push({request: input.request, consumed: false, revoked: false});
    return "created" as const;
  }

  async consumeConnectionRequest(input: Parameters<TelegramStaffOnboardingRepository["consumeConnectionRequest"]>[0]) {
    const stored = [...this.requests].reverse().find(({request, consumed, revoked}) => request.tokenLookup === input.lookup && !consumed && !revoked);
    if (!stored || stored.consumed || stored.revoked || !stored.request.isAvailable(this.now)
      || !input.digestsMatch(input.presentedVerification, stored.request.tokenVerification)) return "unavailable" as const;
    const owner = this.identities.get(stored.request.staffAccountId);
    if (!owner || owner.teamMemberId !== stored.request.teamMemberId || !input.authorizeOwner(owner)) return "unavailable" as const;
    const userId = input.telegramUserId.value;
    const currentUser = this.activeUsersByTeamMember.get(owner.teamMemberId);
    const historicalOwner = this.historicalOwnersByUser.get(userId);
    if ((currentUser && currentUser !== userId) || (historicalOwner && historicalOwner !== owner.teamMemberId)) return "unavailable" as const;
    this.activeUsersByTeamMember.set(owner.teamMemberId, userId);
    this.historicalOwnersByUser.set(userId, owner.teamMemberId);
    this.privateChatsByUser.set(userId, input.privateChatId.value);
    stored.consumed = true;
    return "connected" as const;
  }

  async disconnectOwn(input: Parameters<TelegramStaffOnboardingRepository["disconnectOwn"]>[0]) {
    const owner = this.identities.get(input.staffAccountId);
    if (!owner || owner.teamMemberId !== input.teamMemberId || !input.authorize(owner)) return "unavailable" as const;
    for (const stored of this.requests) if (stored.request.staffAccountId === owner.staffAccountId && !stored.consumed && !stored.revoked) stored.revoked = true;
    return this.activeUsersByTeamMember.delete(owner.teamMemberId) ? "disconnected" as const : "unavailable" as const;
  }

  async forceDisconnect(input: Parameters<TelegramStaffOnboardingRepository["forceDisconnect"]>[0]) {
    const actor = this.identities.get(input.actorStaffAccountId);
    const target = this.identities.get(input.targetStaffAccountId);
    this.authorizationChecks += 1;
    if (!actor || !target || !input.authorize(actor, target)) return "unavailable" as const;
    this.stateReads += 1;
    for (const stored of this.requests) if (stored.request.staffAccountId === target.staffAccountId && !stored.consumed && !stored.revoked) stored.revoked = true;
    return this.activeUsersByTeamMember.delete(target.teamMemberId) ? "disconnected" as const : "unavailable" as const;
  }

  async revokeOwnRequest(input: Parameters<TelegramStaffOnboardingRepository["revokeOwnRequest"]>[0]) {
    const owner = this.identities.get(input.staffAccountId);
    if (!owner || owner.teamMemberId !== input.teamMemberId || !input.authorize(owner)) return "unavailable" as const;
    const pending = this.requests.find(({request, consumed, revoked}) => request.staffAccountId === owner.staffAccountId && !consumed && !revoked);
    if (!pending) return "unavailable" as const;
    pending.revoked = true;
    return "revoked" as const;
  }

  async revokeStaffRequest(input: Parameters<TelegramStaffOnboardingRepository["revokeStaffRequest"]>[0]) {
    const actor = this.identities.get(input.actorStaffAccountId);
    const target = this.identities.get(input.targetStaffAccountId);
    this.authorizationChecks += 1;
    if (!actor || !target || !input.authorize(actor, target)) return "unavailable" as const;
    this.stateReads += 1;
    const pending = this.requests.find(({request, consumed, revoked}) => request.staffAccountId === target.staffAccountId && !consumed && !revoked);
    if (!pending) return "unavailable" as const;
    pending.revoked = true;
    return "revoked" as const;
  }

  async findActorByTelegramUserId(telegramUserId: Parameters<TelegramStaffOnboardingRepository["findActorByTelegramUserId"]>[0]) {
    const ownerTeamMemberId = [...this.activeUsersByTeamMember.entries()].find(([, userId]) => userId === telegramUserId.value)?.[0];
    if (!ownerTeamMemberId) return null;
    return [...this.identities.values()].find((candidate) => candidate.teamMemberId === ownerTeamMemberId) ?? null;
  }
}
