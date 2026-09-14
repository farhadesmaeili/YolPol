import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {NotificationDestinationsDto} from "@/features/notification-destinations/application/dto/notification-destination-dto";
import {
  principalFromNotificationIdentity,
  type NotificationDestinationIdGenerator,
  type NotificationDestinationRepository,
  type NotificationStaffIdentity,
  type TelegramGroupTokenService,
} from "@/features/notification-destinations/application/ports/notification-destination-ports";
import {TelegramGroupConnectionRequest} from "@/features/notification-destinations/domain/entities/telegram-group-connection-request";
import {parseTelegramGroupDisplayName, TelegramGroupChatId} from "@/features/notification-destinations/domain/value-objects/telegram-group";
import {TelegramUserId} from "@/features/telegram-staff-onboarding/domain/value-objects/telegram-identifiers";

const referencePattern = /^[A-Za-z0-9_-]{1,128}$/u;
const groupRequestLifetimeMilliseconds = 10 * 60 * 1_000;

type Clock = Readonly<{now(): Date}>;

function targetAllowed(authorization: StaffAuthorization, actor: NotificationStaffIdentity, target: NotificationStaffIdentity): boolean {
  const principal = principalFromNotificationIdentity(actor);
  if (!actor.accountActive || !actor.teamMemberActive || !target.accountActive || !target.teamMemberActive || !authorization.mayManageTeam(principal)) return false;
  if (actor.staffAccountId === target.staffAccountId) return true;
  return authorization.mayDeactivateStaffMember(principal, {staffAccountId: target.staffAccountId, role: target.role, active: target.accountActive});
}

function actorAllowed(authorization: StaffAuthorization, actor: NotificationStaffIdentity): boolean {
  return actor.accountActive && actor.teamMemberActive && authorization.mayManageTeam(principalFromNotificationIdentity(actor));
}

export class ListNotificationDestinations {
  constructor(private readonly repository: NotificationDestinationRepository, private readonly authorization: StaffAuthorization) {}

  async execute(principal: StaffPrincipal): Promise<Readonly<{status: "found"; value: NotificationDestinationsDto}> | Readonly<{status: "forbidden" | "unavailable"}>> {
    if (!this.authorization.mayManageTeam(principal)) return {status: "forbidden"};
    try {
      const value = await this.repository.read({
        actorStaffAccountId: principal.staffAccountId,
        authorizeActor: (actor) => actorAllowed(this.authorization, actor),
        authorizeTarget: (actor, target) => targetAllowed(this.authorization, actor, target),
      });
      return value ? {status: "found", value} : {status: "forbidden"};
    } catch { return {status: "unavailable"}; }
  }
}

export class SetTeamMemberNotifications {
  constructor(
    private readonly repository: NotificationDestinationRepository,
    private readonly authorization: StaffAuthorization,
    private readonly ids: NotificationDestinationIdGenerator,
  ) {}

  async execute(input: Readonly<{principal: StaffPrincipal; targetStaffAccountId: unknown; enabled: boolean}>) {
    if (!this.authorization.mayManageTeam(input.principal)) return {status: "forbidden" as const};
    if (typeof input.targetStaffAccountId !== "string" || !referencePattern.test(input.targetStaffAccountId)) return {status: "validation_failed" as const};
    try {
      const status = await this.repository.setTeamMember({
        actorStaffAccountId: input.principal.staffAccountId,
        targetStaffAccountId: input.targetStaffAccountId,
        enabled: input.enabled,
        newRecipientId: this.ids.recipientId(),
        eventId: this.ids.eventId(),
        actorReference: this.authorization.actorReferenceFor(input.principal),
        authorize: (actor, target) => targetAllowed(this.authorization, actor, target),
      });
      return {status};
    } catch { return {status: "unavailable" as const}; }
  }
}

export class CreateTelegramGroupConnectionRequest {
  constructor(
    private readonly repository: NotificationDestinationRepository,
    private readonly tokens: TelegramGroupTokenService,
    private readonly authorization: StaffAuthorization,
    private readonly clock: Clock,
  ) {}

  async execute(input: Readonly<{principal: StaffPrincipal}>) {
    if (!this.authorization.mayManageTeam(input.principal)) return {status: "forbidden" as const};
    try {
      const issued = this.tokens.issue();
      const now = this.clock.now();
      const request = TelegramGroupConnectionRequest.create({
        id: issued.requestId,
        staffAccountId: input.principal.staffAccountId,
        teamMemberId: input.principal.teamMemberId,
        tokenLookup: issued.lookup,
        tokenVerification: issued.verification,
        createdAt: now,
        expiresAt: new Date(now.getTime() + groupRequestLifetimeMilliseconds),
      });
      const status = await this.repository.createGroupRequest({request, authorizeActor: (actor) => actorAllowed(this.authorization, actor)});
      return status === "created"
        ? {status, connectionToken: issued.credential, expiresAt: request.expiresAt.toISOString()}
        : {status};
    } catch { return {status: "unavailable" as const}; }
  }
}

export class RevokeTelegramGroupConnectionRequest {
  constructor(private readonly repository: NotificationDestinationRepository, private readonly authorization: StaffAuthorization) {}

  async execute(input: Readonly<{principal: StaffPrincipal}>) {
    if (!this.authorization.mayManageTeam(input.principal)) return {status: "forbidden" as const};
    try {
      return {status: await this.repository.revokeGroupRequest({
        actorStaffAccountId: input.principal.staffAccountId,
        authorizeActor: (actor) => actorAllowed(this.authorization, actor),
      })};
    } catch { return {status: "unavailable" as const}; }
  }
}

export class ConsumeTelegramGroupConnectionRequest {
  constructor(
    private readonly repository: NotificationDestinationRepository,
    private readonly tokens: TelegramGroupTokenService,
    private readonly ids: NotificationDestinationIdGenerator,
    private readonly authorization: StaffAuthorization,
  ) {}

  async execute(input: Readonly<{connectionToken: unknown; telegramUserId: unknown; groupChatId: unknown; displayName: unknown}>) {
    if (typeof input.connectionToken !== "string") return {status: "unavailable" as const};
    const presented = this.tokens.inspect(input.connectionToken);
    if (!presented) return {status: "unavailable" as const};
    try {
      return {status: await this.repository.consumeGroupRequest({
        lookup: presented.lookup,
        presentedVerification: presented.verification,
        senderTelegramUserId: TelegramUserId.create(input.telegramUserId),
        groupChatId: TelegramGroupChatId.create(input.groupChatId),
        displayName: parseTelegramGroupDisplayName(input.displayName),
        newRecipientId: this.ids.recipientId(),
        eventId: this.ids.eventId(),
        digestsMatch: (actual, expected) => this.tokens.digestsMatch(actual, expected),
        authorizeActor: (actor) => actorAllowed(this.authorization, actor),
      })};
    } catch { return {status: "unavailable" as const}; }
  }
}

export class SetTelegramGroupDestination {
  constructor(
    private readonly repository: NotificationDestinationRepository,
    private readonly authorization: StaffAuthorization,
    private readonly ids: NotificationDestinationIdGenerator,
  ) {}

  async execute(input: Readonly<{principal: StaffPrincipal; recipientId: unknown; operation: "ENABLE" | "DISABLE" | "DISCONNECT"}>) {
    if (!this.authorization.mayManageTeam(input.principal)) return {status: "forbidden" as const};
    if (typeof input.recipientId !== "string" || !referencePattern.test(input.recipientId)) return {status: "validation_failed" as const};
    try {
      return {status: await this.repository.setGroup({
        actorStaffAccountId: input.principal.staffAccountId,
        recipientId: input.recipientId,
        operation: input.operation,
        eventId: this.ids.eventId(),
        actorReference: this.authorization.actorReferenceFor(input.principal),
        authorizeActor: (actor) => actorAllowed(this.authorization, actor),
      })};
    } catch { return {status: "unavailable" as const}; }
  }
}
