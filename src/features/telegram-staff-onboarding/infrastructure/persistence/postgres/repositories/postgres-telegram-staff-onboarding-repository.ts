import type {Pool, PoolClient} from "pg";

import type {TelegramStaffIdentity, TelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";
import {TelegramStaffOnboardingPersistenceError} from "@/features/telegram-staff-onboarding/domain/errors/telegram-staff-onboarding-errors";
import {parseStaffRole} from "@/features/staff-authentication/domain/types/staff-role";

type IdentityRow = Readonly<{
  staffAccountId: string;
  teamMemberId: string;
  role: string;
  accountActive: boolean;
  teamMemberActive: boolean;
  displayName: string;
}>;

async function rollback(client: PoolClient): Promise<void> {
  try { await client.query("rollback"); } catch { /* Preserve the original failure. */ }
}

function identity(row: IdentityRow): TelegramStaffIdentity {
  return Object.freeze({...row, role: parseStaffRole(row.role)});
}

async function identitiesForUpdate(client: PoolClient, accountIds: readonly string[]): Promise<readonly TelegramStaffIdentity[]> {
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

function findIdentity(identities: readonly TelegramStaffIdentity[], staffAccountId: string): TelegramStaffIdentity | undefined {
  return identities.find((candidate) => candidate.staffAccountId === staffAccountId);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export class PostgresTelegramStaffOnboardingRepository implements TelegramStaffOnboardingRepository {
  constructor(private readonly pool: Pool) {}

  async getOwnConnection(input: Parameters<TelegramStaffOnboardingRepository["getOwnConnection"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const owner = (await identitiesForUpdate(client, [input.staffAccountId]))[0];
      if (!owner || owner.teamMemberId !== input.teamMemberId || !input.authorize(owner)) {
        await rollback(client);
        return null;
      }
      const state = await client.query<{connected: boolean; pendingExpiresAt: Date | null}>(`
        select
          exists(select 1 from telegram_staff_links where team_member_id = $1 and disconnected_at is null) as connected,
          (select expires_at from telegram_connection_requests
            where staff_account_id = $2 and team_member_id = $1 and consumed_at is null and revoked_at is null
              and expires_at > clock_timestamp()
            order by created_at desc limit 1) as "pendingExpiresAt"
      `, [input.teamMemberId, input.staffAccountId]);
      await client.query("commit");
      const row = state.rows[0];
      return Object.freeze({connected: row?.connected ?? false, pendingExpiresAt: row?.pendingExpiresAt ?? undefined});
    } catch {
      await rollback(client);
      throw new TelegramStaffOnboardingPersistenceError();
    } finally { client.release(); }
  }

  async getStaffConnection(input: Parameters<TelegramStaffOnboardingRepository["getStaffConnection"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const identities = await identitiesForUpdate(client, [input.actorStaffAccountId, input.targetStaffAccountId]);
      const actor = findIdentity(identities, input.actorStaffAccountId);
      const target = findIdentity(identities, input.targetStaffAccountId);
      if (!actor || !target || !input.authorize(actor, target)) {
        await rollback(client);
        return null;
      }
      const state = await client.query<{connected: boolean; pendingExpiresAt: Date | null}>(`
        select
          exists(select 1 from telegram_staff_links where team_member_id = $1 and disconnected_at is null) as connected,
          (select expires_at from telegram_connection_requests
            where staff_account_id = $2 and team_member_id = $1 and consumed_at is null and revoked_at is null
              and expires_at > clock_timestamp()
            order by created_at desc limit 1) as "pendingExpiresAt"
      `, [target.teamMemberId, target.staffAccountId]);
      await client.query("commit");
      const row = state.rows[0];
      return Object.freeze({connected: row?.connected ?? false, pendingExpiresAt: row?.pendingExpiresAt ?? undefined});
    } catch {
      await rollback(client);
      throw new TelegramStaffOnboardingPersistenceError();
    } finally { client.release(); }
  }

  async createConnectionRequest(input: Parameters<TelegramStaffOnboardingRepository["createConnectionRequest"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const owner = (await identitiesForUpdate(client, [input.request.staffAccountId]))[0];
      if (!owner || owner.teamMemberId !== input.request.teamMemberId || !input.authorize(owner)) {
        await rollback(client);
        return "unavailable" as const;
      }
      const databaseNow = (await client.query<{now: Date}>("select clock_timestamp() as now")).rows[0]?.now;
      if (!databaseNow) throw new Error("Database clock unavailable.");
      await client.query(`
        update telegram_connection_requests set revoked_at = $2
        where staff_account_id = $1 and consumed_at is null and revoked_at is null
      `, [input.request.staffAccountId, databaseNow]);
      await client.query(`
        insert into telegram_connection_requests (
          id, staff_account_id, team_member_id, token_lookup, token_verification,
          created_at, expires_at, consumed_at, revoked_at
        ) values ($1,$2,$3,$4,$5,$6,$7,null,null)
      `, [
        input.request.id,
        input.request.staffAccountId,
        input.request.teamMemberId,
        input.request.tokenLookup,
        input.request.tokenVerification,
        input.request.createdAt,
        input.request.expiresAt,
      ]);
      await client.query("commit");
      return "created" as const;
    } catch (error) {
      await rollback(client);
      if (isUniqueViolation(error)) return "unavailable" as const;
      throw new TelegramStaffOnboardingPersistenceError();
    } finally { client.release(); }
  }

  async consumeConnectionRequest(input: Parameters<TelegramStaffOnboardingRepository["consumeConnectionRequest"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const requestResult = await client.query<{
        id: string;
        staffAccountId: string;
        teamMemberId: string;
        tokenVerification: string;
        expiresAt: Date;
        consumedAt: Date | null;
        revokedAt: Date | null;
      }>(`
        select id, staff_account_id as "staffAccountId", team_member_id as "teamMemberId",
          token_verification as "tokenVerification", expires_at as "expiresAt",
          consumed_at as "consumedAt", revoked_at as "revokedAt"
        from telegram_connection_requests where token_lookup = $1 for update
      `, [input.lookup]);
      const request = requestResult.rows[0];
      if (!request) { await rollback(client); return "unavailable" as const; }

      const databaseNow = (await client.query<{now: Date}>("select clock_timestamp() as now")).rows[0]?.now;
      if (!databaseNow || request.consumedAt || request.revokedAt || databaseNow >= request.expiresAt
        || !input.digestsMatch(input.presentedVerification, request.tokenVerification)) {
        await rollback(client);
        return "unavailable" as const;
      }

      const owner = (await identitiesForUpdate(client, [request.staffAccountId]))[0];
      if (!owner || owner.teamMemberId !== request.teamMemberId || !input.authorizeOwner(owner)) {
        await rollback(client);
        return "unavailable" as const;
      }

      const historical = await client.query<{id: string; teamMemberId: string; disconnectedAt: Date | null}>(`
        select id, team_member_id as "teamMemberId", disconnected_at as "disconnectedAt"
        from telegram_staff_links where telegram_user_id = $1 for update
      `, [input.telegramUserId.value]);
      const active = await client.query<{id: string; telegramUserId: string}>(`
        select id, telegram_user_id::text as "telegramUserId"
        from telegram_staff_links where team_member_id = $1 and disconnected_at is null for update
      `, [request.teamMemberId]);
      const existingUser = historical.rows[0];
      const activeLink = active.rows[0];
      if ((existingUser && existingUser.teamMemberId !== request.teamMemberId)
        || (activeLink && activeLink.telegramUserId !== input.telegramUserId.value)) {
        await rollback(client);
        return "unavailable" as const;
      }

      if (existingUser) {
        if (existingUser.disconnectedAt) {
          await client.query(`
            update telegram_staff_links
            set private_chat_id = $2, connected_at = $3, disconnected_at = null, updated_at = $3
            where id = $1
          `, [existingUser.id, input.privateChatId.value, databaseNow]);
        } else {
          await client.query("update telegram_staff_links set private_chat_id = $2, updated_at = $3 where id = $1", [existingUser.id, input.privateChatId.value, databaseNow]);
        }
      } else {
        await client.query(`
          insert into telegram_staff_links (
            id, team_member_id, telegram_user_id, private_chat_id,
            first_linked_at, connected_at, disconnected_at, updated_at
          ) values ($1,$2,$3,$4,$5,$5,null,$5)
        `, [input.linkId, request.teamMemberId, input.telegramUserId.value, input.privateChatId.value, databaseNow]);
      }
      await client.query("update telegram_connection_requests set consumed_at = $2 where id = $1", [request.id, databaseNow]);
      await client.query("commit");
      return "connected" as const;
    } catch (error) {
      await rollback(client);
      if (isUniqueViolation(error)) return "unavailable" as const;
      throw new TelegramStaffOnboardingPersistenceError();
    } finally { client.release(); }
  }

  async disconnectOwn(input: Parameters<TelegramStaffOnboardingRepository["disconnectOwn"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const owner = (await identitiesForUpdate(client, [input.staffAccountId]))[0];
      if (!owner || owner.teamMemberId !== input.teamMemberId || !input.authorize(owner)) {
        await rollback(client);
        return "unavailable" as const;
      }
      const status = await this.disconnectAndRevoke(client, owner.teamMemberId, owner.staffAccountId);
      await client.query("commit");
      return status;
    } catch {
      await rollback(client);
      throw new TelegramStaffOnboardingPersistenceError();
    } finally { client.release(); }
  }

  async forceDisconnect(input: Parameters<TelegramStaffOnboardingRepository["forceDisconnect"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const identities = await identitiesForUpdate(client, [input.actorStaffAccountId, input.targetStaffAccountId]);
      const actor = findIdentity(identities, input.actorStaffAccountId);
      const target = findIdentity(identities, input.targetStaffAccountId);
      if (!actor || !target || !input.authorize(actor, target)) {
        await rollback(client);
        return "unavailable" as const;
      }
      const status = await this.disconnectAndRevoke(client, target.teamMemberId, target.staffAccountId);
      await client.query("commit");
      return status;
    } catch {
      await rollback(client);
      throw new TelegramStaffOnboardingPersistenceError();
    } finally { client.release(); }
  }

  private async disconnectAndRevoke(client: PoolClient, teamMemberId: string, staffAccountId: string): Promise<"disconnected" | "unavailable"> {
    const databaseNow = (await client.query<{now: Date}>("select clock_timestamp() as now")).rows[0]?.now;
    if (!databaseNow) throw new Error("Database clock unavailable.");
    const link = await client.query<{id: string}>(`
      select id from telegram_staff_links where team_member_id = $1 and disconnected_at is null for update
    `, [teamMemberId]);
    await client.query(`
      update telegram_connection_requests set revoked_at = $2
      where staff_account_id = $1 and consumed_at is null and revoked_at is null
    `, [staffAccountId, databaseNow]);
    if (!link.rows[0]) return "unavailable";
    await client.query("update telegram_staff_links set disconnected_at = $2, updated_at = $2 where id = $1", [link.rows[0].id, databaseNow]);
    return "disconnected";
  }

  async revokeOwnRequest(input: Parameters<TelegramStaffOnboardingRepository["revokeOwnRequest"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const owner = (await identitiesForUpdate(client, [input.staffAccountId]))[0];
      if (!owner || owner.teamMemberId !== input.teamMemberId || !input.authorize(owner)) {
        await rollback(client);
        return "unavailable" as const;
      }
      const status = await this.revokeOutstanding(client, owner.staffAccountId);
      await client.query("commit");
      return status;
    } catch {
      await rollback(client);
      throw new TelegramStaffOnboardingPersistenceError();
    } finally { client.release(); }
  }

  async revokeStaffRequest(input: Parameters<TelegramStaffOnboardingRepository["revokeStaffRequest"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const identities = await identitiesForUpdate(client, [input.actorStaffAccountId, input.targetStaffAccountId]);
      const actor = findIdentity(identities, input.actorStaffAccountId);
      const target = findIdentity(identities, input.targetStaffAccountId);
      if (!actor || !target || !input.authorize(actor, target)) {
        await rollback(client);
        return "unavailable" as const;
      }
      const status = await this.revokeOutstanding(client, target.staffAccountId);
      await client.query("commit");
      return status;
    } catch {
      await rollback(client);
      throw new TelegramStaffOnboardingPersistenceError();
    } finally { client.release(); }
  }

  private async revokeOutstanding(client: PoolClient, staffAccountId: string): Promise<"revoked" | "unavailable"> {
    const result = await client.query(`
      update telegram_connection_requests set revoked_at = clock_timestamp()
      where staff_account_id = $1 and consumed_at is null and revoked_at is null
    `, [staffAccountId]);
    return result.rowCount ? "revoked" : "unavailable";
  }

  async findActorByTelegramUserId(telegramUserId: Parameters<TelegramStaffOnboardingRepository["findActorByTelegramUserId"]>[0]) {
    try {
      const result = await this.pool.query<IdentityRow>(`
        select sa.id as "staffAccountId", sa.team_member_id as "teamMemberId", sa.role,
          sa.active as "accountActive", tm.active as "teamMemberActive", tm.display_name as "displayName"
        from telegram_staff_links link
        join inquiry_team_members tm on tm.id = link.team_member_id
        join staff_accounts sa on sa.team_member_id = tm.id
        where link.telegram_user_id = $1 and link.disconnected_at is null
      `, [telegramUserId.value]);
      return result.rows[0] ? identity(result.rows[0]) : null;
    } catch { throw new TelegramStaffOnboardingPersistenceError(); }
  }
}
