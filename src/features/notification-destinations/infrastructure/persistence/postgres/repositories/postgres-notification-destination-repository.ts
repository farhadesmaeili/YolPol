import type {Pool, PoolClient} from "pg";

import type {NotificationDestinationAuditEventType, NotificationDestinationsDto} from "@/features/notification-destinations/application/dto/notification-destination-dto";
import type {NotificationDestinationRepository, NotificationStaffIdentity} from "@/features/notification-destinations/application/ports/notification-destination-ports";
import {NotificationDestinationPersistenceError} from "@/features/notification-destinations/domain/errors/notification-destination-errors";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

type IdentityRow = Readonly<{
  staffAccountId: string;
  teamMemberId: string;
  role: string;
  accountActive: boolean;
  teamMemberActive: boolean;
  displayName: string;
}>;

function role(value: string): StaffRole {
  if (value !== "SUPER_ADMIN" && value !== "ADMIN" && value !== "SALES" && value !== "VIEWER") throw new NotificationDestinationPersistenceError();
  return value;
}

function identity(row: IdentityRow): NotificationStaffIdentity {
  return Object.freeze({...row, role: role(row.role)});
}

async function rollback(client: PoolClient): Promise<void> { try { await client.query("rollback"); } catch { /* Preserve the original persistence failure. */ } }

async function identitiesForUpdate(client: PoolClient, accountIds: readonly string[]): Promise<readonly NotificationStaffIdentity[]> {
  const result = await client.query<IdentityRow>(`
    select sa.id as "staffAccountId", sa.team_member_id as "teamMemberId", sa.role,
      sa.active as "accountActive", tm.active as "teamMemberActive", tm.display_name as "displayName"
    from staff_accounts sa
    join inquiry_team_members tm on tm.id = sa.team_member_id
    where sa.id = any($1::varchar[])
    order by sa.id
    for update of sa, tm
  `, [accountIds]);
  return result.rows.map(identity);
}

function findIdentity(identities: readonly NotificationStaffIdentity[], staffAccountId: string): NotificationStaffIdentity | undefined {
  return identities.find((candidate) => candidate.staffAccountId === staffAccountId);
}

type RecipientState = Readonly<{id: string; kind: string; displayName: string; authorized: boolean; notificationsEnabled: boolean}>;

async function appendEvent(client: PoolClient, input: Readonly<{
  eventId: string;
  recipientId: string;
  eventType: NotificationDestinationAuditEventType;
  destinationKind: "TEAM_GROUP" | "TEAM_MEMBER";
  displayName: string;
  actorReference: string;
  actorDisplayName: string;
  previousAuthorized: boolean;
  previousNotificationsEnabled: boolean;
  newAuthorized: boolean;
  newNotificationsEnabled: boolean;
  occurredAt: Date;
}>): Promise<void> {
  await client.query(`
    insert into communication_recipient_events (
      id,recipient_id,event_type,destination_kind,display_name,actor_reference,actor_display_name,
      previous_authorized,previous_notifications_enabled,new_authorized,new_notifications_enabled,occurred_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  `, [input.eventId, input.recipientId, input.eventType, input.destinationKind, input.displayName, input.actorReference,
    input.actorDisplayName, input.previousAuthorized, input.previousNotificationsEnabled, input.newAuthorized,
    input.newNotificationsEnabled, input.occurredAt]);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class PostgresNotificationDestinationRepository implements NotificationDestinationRepository {
  constructor(private readonly pool: Pool) {}

  async read(input: Parameters<NotificationDestinationRepository["read"]>[0]): Promise<NotificationDestinationsDto | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = (await identitiesForUpdate(client, [input.actorStaffAccountId]))[0];
      if (!actor || !input.authorizeActor(actor)) { await rollback(client); return null; }
      const members = await client.query<IdentityRow & Readonly<{telegramLinked: boolean; authorized: boolean; notificationsEnabled: boolean}>>(`
        select sa.id as "staffAccountId", sa.team_member_id as "teamMemberId", sa.role,
          sa.active as "accountActive", tm.active as "teamMemberActive", tm.display_name as "displayName",
          (link.id is not null) as "telegramLinked",
          coalesce(recipient.authorized, false) as authorized,
          coalesce(recipient.notifications_enabled, false) as "notificationsEnabled"
        from staff_accounts sa
        join inquiry_team_members tm on tm.id = sa.team_member_id
        left join telegram_staff_links link on link.team_member_id = tm.id and link.disconnected_at is null
        left join lateral (
          select authorized, notifications_enabled
          from communication_recipients
          where channel='TELEGRAM' and kind='TEAM_MEMBER' and team_member_id=tm.id
          order by authorized desc, updated_at desc, id desc limit 1
        ) recipient on true
        where link.id is not null
        order by tm.display_name, sa.id
      `);
      const groups = await client.query<{recipientId: string; displayName: string; authorized: boolean; notificationsEnabled: boolean}>(`
        select id as "recipientId", display_name as "displayName", authorized, notifications_enabled as "notificationsEnabled"
        from communication_recipients where channel='TELEGRAM' and kind='TEAM_GROUP'
        order by display_name, id
      `);
      const events = await client.query<{id: string; eventType: string; destinationKind: string; displayName: string; actorDisplayName: string; occurredAt: Date}>(`
        select id, event_type as "eventType", destination_kind as "destinationKind", display_name as "displayName",
          actor_display_name as "actorDisplayName", occurred_at as "occurredAt"
        from communication_recipient_events order by occurred_at desc, id desc limit 100
      `);
      const pending = await client.query<{expiresAt: Date}>(`
        select expires_at as "expiresAt" from telegram_group_connection_requests
        where staff_account_id=$1 and consumed_at is null and revoked_at is null and expires_at > clock_timestamp()
        order by created_at desc limit 1
      `, [actor.staffAccountId]);
      await client.query("commit");
      return Object.freeze({
        teamMembers: Object.freeze(members.rows.map((row) => Object.freeze({
          staffAccountId: row.staffAccountId,
          displayName: row.displayName,
          role: role(row.role),
          telegramLinked: row.telegramLinked,
          authorized: row.authorized,
          notificationsEnabled: row.notificationsEnabled,
          mayManage: input.authorizeTarget(actor, identity(row)),
        }))),
        groups: Object.freeze(groups.rows.map((row) => Object.freeze(row))),
        auditEvents: Object.freeze(events.rows.map((row) => {
          if ((row.destinationKind !== "TEAM_GROUP" && row.destinationKind !== "TEAM_MEMBER")
            || !["TEAM_MEMBER_ENABLED", "TEAM_MEMBER_DISABLED", "TEAM_MEMBER_LINK_DISCONNECTED", "TEAM_GROUP_AUTHORIZED", "TEAM_GROUP_ENABLED", "TEAM_GROUP_DISABLED", "TEAM_GROUP_DISCONNECTED"].includes(row.eventType)) {
            throw new NotificationDestinationPersistenceError();
          }
          return Object.freeze({...row, eventType: row.eventType as NotificationDestinationAuditEventType, destinationKind: row.destinationKind, occurredAt: row.occurredAt.toISOString()});
        })),
        ...(pending.rows[0] ? {pendingGroupRequestExpiresAt: pending.rows[0].expiresAt.toISOString()} : {}),
        mayCreateGroupRequest: true,
      });
    } catch (error) {
      await rollback(client);
      if (error instanceof NotificationDestinationPersistenceError) throw error;
      throw new NotificationDestinationPersistenceError();
    } finally { client.release(); }
  }

  async setTeamMember(input: Parameters<NotificationDestinationRepository["setTeamMember"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const identities = await identitiesForUpdate(client, [input.actorStaffAccountId, input.targetStaffAccountId]);
      const actor = findIdentity(identities, input.actorStaffAccountId);
      const target = findIdentity(identities, input.targetStaffAccountId);
      if (!actor || !target || !input.authorize(actor, target)) { await rollback(client); return "unavailable" as const; }
      const link = await client.query<{privateChatId: string}>(`
        select private_chat_id::text as "privateChatId" from telegram_staff_links
        where team_member_id=$1 and disconnected_at is null for update
      `, [target.teamMemberId]);
      if (!link.rows[0]) { await rollback(client); return "unavailable" as const; }
      const existing = await client.query<RecipientState>(`
        select id,kind,display_name as "displayName",authorized,notifications_enabled as "notificationsEnabled"
        from communication_recipients where channel='TELEGRAM' and kind='TEAM_MEMBER' and team_member_id=$1
        order by authorized desc,updated_at desc,id desc limit 1 for update
      `, [target.teamMemberId]);
      const previous = existing.rows[0];
      if (!input.enabled && (!previous || !previous.authorized || !previous.notificationsEnabled)) { await client.query("commit"); return "unchanged" as const; }
      if (input.enabled && previous?.authorized && previous.notificationsEnabled && previous.displayName === target.displayName) {
        await client.query("commit"); return "unchanged" as const;
      }
      const now = (await client.query<{now: Date}>("select clock_timestamp() as now")).rows[0]?.now;
      if (!now) throw new Error("Database clock unavailable.");
      const recipientId = previous?.id ?? input.newRecipientId;
      if (previous) {
        await client.query(`update communication_recipients set external_id=$2,display_name=$3,authorized=true,notifications_enabled=$4,updated_at=$5 where id=$1`,
          [recipientId, link.rows[0].privateChatId, target.displayName, input.enabled, now]);
      } else {
        await client.query(`insert into communication_recipients (id,channel,kind,external_id,display_name,team_member_id,authorized,notifications_enabled,created_at,updated_at)
          values ($1,'TELEGRAM','TEAM_MEMBER',$2,$3,$4,true,$5,$6,$6)`,
          [recipientId, link.rows[0].privateChatId, target.displayName, target.teamMemberId, input.enabled, now]);
      }
      await appendEvent(client, {
        eventId: input.eventId, recipientId, eventType: input.enabled ? "TEAM_MEMBER_ENABLED" : "TEAM_MEMBER_DISABLED",
        destinationKind: "TEAM_MEMBER", displayName: target.displayName, actorReference: input.actorReference,
        actorDisplayName: actor.displayName, previousAuthorized: previous?.authorized ?? false,
        previousNotificationsEnabled: previous?.notificationsEnabled ?? false, newAuthorized: true,
        newNotificationsEnabled: input.enabled, occurredAt: now,
      });
      await client.query("commit");
      return "changed" as const;
    } catch (error) {
      await rollback(client);
      if (isUniqueViolation(error)) return "unavailable" as const;
      throw new NotificationDestinationPersistenceError();
    } finally { client.release(); }
  }

  async createGroupRequest(input: Parameters<NotificationDestinationRepository["createGroupRequest"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = (await identitiesForUpdate(client, [input.request.staffAccountId]))[0];
      if (!actor || actor.teamMemberId !== input.request.teamMemberId || !input.authorizeActor(actor)) { await rollback(client); return "unavailable" as const; }
      const link = await client.query(`select 1 from telegram_staff_links where team_member_id=$1 and disconnected_at is null for update`, [actor.teamMemberId]);
      if (!link.rows[0]) { await rollback(client); return "telegram_not_linked" as const; }
      const now = (await client.query<{now: Date}>("select clock_timestamp() as now")).rows[0]?.now;
      if (!now) throw new Error("Database clock unavailable.");
      await client.query(`update telegram_group_connection_requests set revoked_at=$2 where staff_account_id=$1 and consumed_at is null and revoked_at is null`, [actor.staffAccountId, now]);
      await client.query(`insert into telegram_group_connection_requests (id,staff_account_id,team_member_id,token_lookup,token_verification,created_at,expires_at,consumed_at,revoked_at)
        values ($1,$2,$3,$4,$5,$6,$7,null,null)`, [input.request.id, actor.staffAccountId, actor.teamMemberId, input.request.tokenLookup, input.request.tokenVerification, input.request.createdAt, input.request.expiresAt]);
      await client.query("commit");
      return "created" as const;
    } catch (error) {
      await rollback(client);
      if (isUniqueViolation(error)) return "unavailable" as const;
      throw new NotificationDestinationPersistenceError();
    } finally { client.release(); }
  }

  async revokeGroupRequest(input: Parameters<NotificationDestinationRepository["revokeGroupRequest"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = (await identitiesForUpdate(client, [input.actorStaffAccountId]))[0];
      if (!actor || !input.authorizeActor(actor)) { await rollback(client); return "unavailable" as const; }
      const result = await client.query(`update telegram_group_connection_requests set revoked_at=clock_timestamp()
        where staff_account_id=$1 and consumed_at is null and revoked_at is null`, [actor.staffAccountId]);
      await client.query("commit");
      return result.rowCount ? "revoked" as const : "unavailable" as const;
    } catch { await rollback(client); throw new NotificationDestinationPersistenceError(); }
    finally { client.release(); }
  }

  async consumeGroupRequest(input: Parameters<NotificationDestinationRepository["consumeGroupRequest"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{id: string; staffAccountId: string; teamMemberId: string; tokenVerification: string; expiresAt: Date; consumedAt: Date | null; revokedAt: Date | null}>(`
        select id,staff_account_id as "staffAccountId",team_member_id as "teamMemberId",token_verification as "tokenVerification",
          expires_at as "expiresAt",consumed_at as "consumedAt",revoked_at as "revokedAt"
        from telegram_group_connection_requests where token_lookup=$1 for update
      `, [input.lookup]);
      const request = result.rows[0];
      const now = (await client.query<{now: Date}>("select clock_timestamp() as now")).rows[0]?.now;
      if (!request || !now || request.consumedAt || request.revokedAt || now >= request.expiresAt
        || !input.digestsMatch(input.presentedVerification, request.tokenVerification)) { await rollback(client); return "unavailable" as const; }
      const actor = (await identitiesForUpdate(client, [request.staffAccountId]))[0];
      if (!actor || actor.teamMemberId !== request.teamMemberId || !input.authorizeActor(actor)) { await rollback(client); return "unavailable" as const; }
      const ownerLink = await client.query(`select 1 from telegram_staff_links where team_member_id=$1 and telegram_user_id=$2 and disconnected_at is null for update`,
        [actor.teamMemberId, input.senderTelegramUserId.value]);
      if (!ownerLink.rows[0]) { await rollback(client); return "unavailable" as const; }
      const existingResult = await client.query<RecipientState>(`
        select id,kind,display_name as "displayName",authorized,notifications_enabled as "notificationsEnabled"
        from communication_recipients where channel='TELEGRAM' and external_id=$1 for update
      `, [input.groupChatId.value]);
      const previous = existingResult.rows[0];
      if (previous && previous.kind !== "TEAM_GROUP") { await rollback(client); return "unavailable" as const; }
      const recipientId = previous?.id ?? input.newRecipientId;
      if (previous) {
        await client.query(`update communication_recipients set display_name=$2,authorized=true,notifications_enabled=true,updated_at=$3 where id=$1`, [recipientId, input.displayName, now]);
      } else {
        await client.query(`insert into communication_recipients (id,channel,kind,external_id,display_name,team_member_id,authorized,notifications_enabled,created_at,updated_at)
          values ($1,'TELEGRAM','TEAM_GROUP',$2,$3,null,true,true,$4,$4)`, [recipientId, input.groupChatId.value, input.displayName, now]);
      }
      await appendEvent(client, {
        eventId: input.eventId, recipientId, eventType: "TEAM_GROUP_AUTHORIZED", destinationKind: "TEAM_GROUP",
        displayName: input.displayName, actorReference: `staff:${actor.teamMemberId}`, actorDisplayName: actor.displayName,
        previousAuthorized: previous?.authorized ?? false, previousNotificationsEnabled: previous?.notificationsEnabled ?? false,
        newAuthorized: true, newNotificationsEnabled: true, occurredAt: now,
      });
      await client.query("update telegram_group_connection_requests set consumed_at=$2 where id=$1", [request.id, now]);
      await client.query("commit");
      return "authorized" as const;
    } catch (error) {
      await rollback(client);
      if (isUniqueViolation(error)) return "unavailable" as const;
      throw new NotificationDestinationPersistenceError();
    } finally { client.release(); }
  }

  async setGroup(input: Parameters<NotificationDestinationRepository["setGroup"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const actor = (await identitiesForUpdate(client, [input.actorStaffAccountId]))[0];
      if (!actor || !input.authorizeActor(actor)) { await rollback(client); return "unavailable" as const; }
      const result = await client.query<RecipientState>(`
        select id,kind,display_name as "displayName",authorized,notifications_enabled as "notificationsEnabled"
        from communication_recipients where id=$1 and channel='TELEGRAM' and kind='TEAM_GROUP' for update
      `, [input.recipientId]);
      const previous = result.rows[0];
      if (!previous || (input.operation === "ENABLE" && !previous.authorized)) { await rollback(client); return "unavailable" as const; }
      const nextAuthorized = input.operation === "DISCONNECT" ? false : previous.authorized;
      const nextEnabled = input.operation === "ENABLE";
      if (previous.authorized === nextAuthorized && previous.notificationsEnabled === nextEnabled) { await client.query("commit"); return "unchanged" as const; }
      const now = (await client.query<{now: Date}>("select clock_timestamp() as now")).rows[0]?.now;
      if (!now) throw new Error("Database clock unavailable.");
      await client.query("update communication_recipients set authorized=$2,notifications_enabled=$3,updated_at=$4 where id=$1", [previous.id, nextAuthorized, nextEnabled, now]);
      const eventType = input.operation === "ENABLE" ? "TEAM_GROUP_ENABLED" : input.operation === "DISABLE" ? "TEAM_GROUP_DISABLED" : "TEAM_GROUP_DISCONNECTED";
      await appendEvent(client, {
        eventId: input.eventId, recipientId: previous.id, eventType, destinationKind: "TEAM_GROUP", displayName: previous.displayName,
        actorReference: input.actorReference, actorDisplayName: actor.displayName, previousAuthorized: previous.authorized,
        previousNotificationsEnabled: previous.notificationsEnabled, newAuthorized: nextAuthorized, newNotificationsEnabled: nextEnabled, occurredAt: now,
      });
      await client.query("commit");
      return "changed" as const;
    } catch { await rollback(client); throw new NotificationDestinationPersistenceError(); }
    finally { client.release(); }
  }
}
