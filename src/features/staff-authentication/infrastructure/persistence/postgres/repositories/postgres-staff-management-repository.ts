import type {Pool, PoolClient, QueryResultRow} from "pg";

import type {
  StaffManagementIdentity,
  StaffManagementRepository,
  StaffManagementTarget,
} from "@/features/staff-authentication/application/ports/staff-management-ports";
import type {StaffAccountSummaryDto, StaffInvitationSummaryDto} from "@/features/staff-authentication/application/dto/staff-management-dto";
import {StaffInvitation} from "@/features/staff-authentication/domain/entities/staff-invitation";
import {parseStaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAuthenticationPersistenceError} from "@/features/staff-authentication/infrastructure/errors/staff-authentication-persistence-error";

const staffAdministrationLockKey = 1_968_737_411;

type IdentityRow = QueryResultRow & {
  staffAccountId: string;
  teamMemberId: string;
  role: string;
  accountActive: boolean;
  teamMemberActive: boolean;
  displayName: string;
};

type InvitationRow = QueryResultRow & {
  id: string;
  normalizedEmail: string;
  displayName: string;
  targetRole: string;
  tokenLookup: string;
  tokenVerification: string;
  createdByStaffAccountId: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
};

type AccountRow = QueryResultRow & {
  id: string;
  displayName: string;
  normalizedEmail: string;
  role: string;
  accountActive: boolean;
  teamMemberActive: boolean;
  createdAt: Date;
  telegramLinked: boolean;
};

type PostgresError = Readonly<{code?: unknown; constraint?: unknown}>;
type DatabaseTimeRow = QueryResultRow & {authoritativeNow: Date};

function invitationFromRow(row: InvitationRow): StaffInvitation {
  return StaffInvitation.reconstitute({
    id: row.id,
    normalizedEmail: row.normalizedEmail,
    displayName: row.displayName,
    targetRole: row.targetRole,
    tokenLookup: row.tokenLookup,
    tokenVerification: row.tokenVerification,
    createdByStaffAccountId: row.createdByStaffAccountId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    ...(row.consumedAt ? {consumedAt: row.consumedAt} : {}),
    ...(row.revokedAt ? {revokedAt: row.revokedAt} : {}),
  });
}

function identityFromRow(row: IdentityRow): StaffManagementIdentity {
  return Object.freeze({...row, role: parseStaffRole(row.role)});
}

function targetFromIdentity(identity: StaffManagementIdentity): StaffManagementTarget {
  return Object.freeze({staffAccountId: identity.staffAccountId, role: identity.role, active: identity.accountActive && identity.teamMemberActive});
}

async function identitiesForUpdate(client: PoolClient, accountIds: readonly string[]): Promise<readonly StaffManagementIdentity[]> {
  const result = await client.query<IdentityRow>(`
    select
      sa.id as "staffAccountId",
      sa.team_member_id as "teamMemberId",
      sa.role,
      sa.active as "accountActive",
      tm.active as "teamMemberActive",
      tm.display_name as "displayName"
    from staff_accounts sa
    join inquiry_team_members tm on tm.id = sa.team_member_id
    where sa.id = any($1::varchar[])
    order by sa.id
    for update of sa, tm
  `, [[...new Set(accountIds)]]);
  return result.rows.map(identityFromRow);
}

function findIdentity(identities: readonly StaffManagementIdentity[], accountId: string): StaffManagementIdentity | null {
  return identities.find((identity) => identity.staffAccountId === accountId) ?? null;
}

async function rollback(client: PoolClient): Promise<void> {
  try { await client.query("rollback"); } catch { /* The original persistence failure remains authoritative. */ }
}

async function activeSuperAdminCount(client: PoolClient): Promise<number> {
  const result = await client.query<{count: string}>(`
    select count(*)::text as count
    from staff_accounts sa
    join inquiry_team_members tm on tm.id = sa.team_member_id
    where sa.role = 'SUPER_ADMIN' and sa.active = true and tm.active = true
  `);
  const count = Number(result.rows[0]?.count);
  if (!Number.isSafeInteger(count) || count < 0) throw new StaffAuthenticationPersistenceError();
  return count;
}

export class PostgresStaffManagementRepository implements StaffManagementRepository {
  constructor(private readonly pool: Pool) {}

  async createInvitation(input: Parameters<StaffManagementRepository["createInvitation"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const identities = await identitiesForUpdate(client, [input.invitation.createdByStaffAccountId]);
      const actor = identities[0];
      if (!actor || !actor.accountActive || !actor.teamMemberActive || !input.authorize(actor)) {
        await rollback(client);
        return "forbidden" as const;
      }
      const existingAccount = await client.query("select 1 from staff_accounts where normalized_email = $1 limit 1", [input.invitation.normalizedEmail]);
      if (existingAccount.rowCount) {
        await rollback(client);
        return "email_conflict" as const;
      }
      await client.query(`
        update staff_invitations
        set revoked_at = $2
        where normalized_email = $1 and consumed_at is null and revoked_at is null and expires_at <= $2
      `, [input.invitation.normalizedEmail, input.invitation.createdAt]);
      await client.query(`
        insert into staff_invitations (
          id, normalized_email, display_name, target_role, token_lookup, token_verification,
          created_by_staff_account_id, created_at, expires_at, consumed_at, revoked_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,null,null)
      `, [
        input.invitation.id,
        input.invitation.normalizedEmail,
        input.invitation.displayName,
        input.invitation.targetRole,
        input.invitation.tokenLookup,
        input.invitation.tokenVerification,
        input.invitation.createdByStaffAccountId,
        input.invitation.createdAt,
        input.invitation.expiresAt,
      ]);
      await client.query("commit");
      return "created" as const;
    } catch (error) {
      await rollback(client);
      const postgres = error as PostgresError;
      if (postgres.code === "23505" && postgres.constraint === "staff_invitations_outstanding_email_uidx") return "invitation_conflict" as const;
      if (postgres.code === "23505" && postgres.constraint === "staff_accounts_normalized_email_uidx") return "email_conflict" as const;
      throw new StaffAuthenticationPersistenceError();
    } finally { client.release(); }
  }

  async findInvitationByLookup(lookup: string): Promise<StaffInvitation | null> {
    try {
      const result = await this.pool.query<InvitationRow>(`
        select id, normalized_email as "normalizedEmail", display_name as "displayName", target_role as "targetRole",
          token_lookup as "tokenLookup", token_verification as "tokenVerification",
          created_by_staff_account_id as "createdByStaffAccountId", created_at as "createdAt", expires_at as "expiresAt",
          consumed_at as "consumedAt", revoked_at as "revokedAt"
        from staff_invitations where token_lookup = $1 limit 1
      `, [lookup]);
      return result.rows[0] ? invitationFromRow(result.rows[0]) : null;
    } catch { throw new StaffAuthenticationPersistenceError(); }
  }

  async activateInvitation(input: Parameters<StaffManagementRepository["activateInvitation"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const inviteResult = await client.query<InvitationRow>(`
        select
          si.id, si.normalized_email as "normalizedEmail", si.display_name as "displayName", si.target_role as "targetRole",
          si.token_lookup as "tokenLookup", si.token_verification as "tokenVerification",
          si.created_by_staff_account_id as "createdByStaffAccountId", si.created_at as "createdAt", si.expires_at as "expiresAt",
          si.consumed_at as "consumedAt", si.revoked_at as "revokedAt"
        from staff_invitations si
        where si.id = $1
        for update of si
      `, [input.invitationId]);
      const row = inviteResult.rows[0];
      const databaseTime = await client.query<DatabaseTimeRow>(`select clock_timestamp() as "authoritativeNow"`);
      const authoritativeNow = databaseTime.rows[0]?.authoritativeNow;
      if (!(authoritativeNow instanceof Date) || !Number.isFinite(authoritativeNow.getTime())) throw new StaffAuthenticationPersistenceError();
      if (!row
        || row.normalizedEmail !== input.normalizedEmail
        || row.tokenVerification !== input.presentedVerification
        || row.consumedAt !== null
        || row.revokedAt !== null
        || authoritativeNow >= row.expiresAt) {
        await rollback(client);
        return "invitation_unavailable" as const;
      }
      const identities = await identitiesForUpdate(client, [row.createdByStaffAccountId]);
      const creator = identities[0];
      const targetRole = parseStaffRole(row.targetRole);
      if (!creator || !creator.accountActive || !creator.teamMemberActive || !input.authorizeCreator(creator, targetRole)) {
        await rollback(client);
        return "forbidden" as const;
      }
      const accountConflict = await client.query("select 1 from staff_accounts where normalized_email = $1 limit 1", [input.normalizedEmail]);
      if (accountConflict.rowCount) {
        await rollback(client);
        return "account_conflict" as const;
      }
      await client.query(`insert into inquiry_team_members (id, display_name, active, created_at, updated_at) values ($1,$2,true,$3,$3)`, [input.teamMemberId, row.displayName, authoritativeNow]);
      await client.query(`
        insert into staff_accounts (id, team_member_id, normalized_email, password_hash, role, active, created_at, updated_at)
        values ($1,$2,$3,$4,$5,true,$6,$6)
      `, [input.staffAccountId, input.teamMemberId, input.normalizedEmail, input.passwordHash, targetRole, authoritativeNow]);
      const consumed = await client.query(`
        update staff_invitations set consumed_at = $2
        where id = $1 and consumed_at is null and revoked_at is null and expires_at > $2
        returning id
      `, [input.invitationId, authoritativeNow]);
      if (consumed.rowCount !== 1) {
        await rollback(client);
        return "invitation_unavailable" as const;
      }
      await client.query("commit");
      return "activated" as const;
    } catch (error) {
      await rollback(client);
      if ((error as PostgresError).code === "23505") return "account_conflict" as const;
      throw new StaffAuthenticationPersistenceError();
    } finally { client.release(); }
  }

  async listAccounts(): Promise<readonly StaffAccountSummaryDto[]> {
    try {
      const result = await this.pool.query<AccountRow>(`
        select sa.id, tm.display_name as "displayName", sa.normalized_email as "normalizedEmail", sa.role,
          sa.active as "accountActive", tm.active as "teamMemberActive", sa.created_at as "createdAt",
          exists (
            select 1 from communication_recipients cr
            where cr.team_member_id = tm.id and cr.channel = 'TELEGRAM' and cr.kind = 'TEAM_MEMBER'
          ) as "telegramLinked"
        from staff_accounts sa
        join inquiry_team_members tm on tm.id = sa.team_member_id
        order by tm.display_name, sa.id
      `);
      return Object.freeze(result.rows.map((row) => Object.freeze({
        id: row.id,
        displayName: row.displayName,
        normalizedEmail: row.normalizedEmail,
        role: parseStaffRole(row.role),
        active: row.accountActive && row.teamMemberActive,
        createdAt: row.createdAt.toISOString(),
        telegramLinked: row.telegramLinked,
      })));
    } catch { throw new StaffAuthenticationPersistenceError(); }
  }

  async listInvitations(at: Date): Promise<readonly StaffInvitationSummaryDto[]> {
    try {
      const result = await this.pool.query<InvitationRow>(`
        select id, normalized_email as "normalizedEmail", display_name as "displayName", target_role as "targetRole",
          token_lookup as "tokenLookup", token_verification as "tokenVerification",
          created_by_staff_account_id as "createdByStaffAccountId", created_at as "createdAt", expires_at as "expiresAt",
          consumed_at as "consumedAt", revoked_at as "revokedAt"
        from staff_invitations order by created_at desc, id desc
      `);
      return Object.freeze(result.rows.map((row) => {
        const invitation = invitationFromRow(row);
        const status = invitation.consumedAt ? "CONSUMED" : invitation.revokedAt ? "REVOKED" : at >= invitation.expiresAt ? "EXPIRED" : "ACTIVE";
        return Object.freeze({
          id: invitation.id,
          displayName: invitation.displayName,
          normalizedEmail: invitation.normalizedEmail,
          targetRole: invitation.targetRole,
          createdAt: invitation.createdAt.toISOString(),
          expiresAt: invitation.expiresAt.toISOString(),
          status,
        });
      }));
    } catch { throw new StaffAuthenticationPersistenceError(); }
  }

  async revokeInvitation(input: Parameters<StaffManagementRepository["revokeInvitation"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const invitationResult = await client.query<{targetRole: string; consumedAt: Date | null; revokedAt: Date | null}>(`
        select target_role as "targetRole", consumed_at as "consumedAt", revoked_at as "revokedAt"
        from staff_invitations where id = $1 for update
      `, [input.invitationId]);
      const invitation = invitationResult.rows[0];
      if (!invitation) { await rollback(client); return "not_found" as const; }
      const identities = await identitiesForUpdate(client, [input.actorStaffAccountId]);
      const actor = identities[0];
      if (!actor || !actor.accountActive || !actor.teamMemberActive || !input.authorize(actor, parseStaffRole(invitation.targetRole))) {
        await rollback(client); return "forbidden" as const;
      }
      if (invitation.consumedAt || invitation.revokedAt) { await rollback(client); return "unavailable" as const; }
      await client.query("update staff_invitations set revoked_at = $2 where id = $1", [input.invitationId, input.revokedAt]);
      await client.query("commit");
      return "revoked" as const;
    } catch { await rollback(client); throw new StaffAuthenticationPersistenceError(); }
    finally { client.release(); }
  }

  async changeRole(input: Parameters<StaffManagementRepository["changeRole"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock($1)", [staffAdministrationLockKey]);
      const identities = await identitiesForUpdate(client, [input.actorStaffAccountId, input.targetStaffAccountId]);
      const actor = findIdentity(identities, input.actorStaffAccountId);
      const targetIdentity = findIdentity(identities, input.targetStaffAccountId);
      if (!actor || !targetIdentity) { await rollback(client); return "not_found" as const; }
      const target = targetFromIdentity(targetIdentity);
      if (!actor.accountActive || !actor.teamMemberActive || !input.authorize(actor, target)) { await rollback(client); return "forbidden" as const; }
      if (target.role === input.newRole) { await rollback(client); return "unchanged" as const; }
      if (target.active && target.role === "SUPER_ADMIN" && input.newRole !== "SUPER_ADMIN" && await activeSuperAdminCount(client) <= 1) {
        await rollback(client); return "last_super_admin" as const;
      }
      await client.query("update staff_accounts set role = $2, updated_at = $3 where id = $1", [input.targetStaffAccountId, input.newRole, input.changedAt]);
      await client.query("commit");
      return "changed" as const;
    } catch { await rollback(client); throw new StaffAuthenticationPersistenceError(); }
    finally { client.release(); }
  }

  async setActive(input: Parameters<StaffManagementRepository["setActive"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock($1)", [staffAdministrationLockKey]);
      const identities = await identitiesForUpdate(client, [input.actorStaffAccountId, input.targetStaffAccountId]);
      const actor = findIdentity(identities, input.actorStaffAccountId);
      const targetIdentity = findIdentity(identities, input.targetStaffAccountId);
      if (!actor || !targetIdentity) { await rollback(client); return "not_found" as const; }
      const target = targetFromIdentity(targetIdentity);
      if (!actor.accountActive || !actor.teamMemberActive || !input.authorize(actor, target)) { await rollback(client); return "forbidden" as const; }
      if (target.active === input.active && targetIdentity.accountActive === targetIdentity.teamMemberActive) { await rollback(client); return "unchanged" as const; }
      if (!input.active && target.active && target.role === "SUPER_ADMIN" && await activeSuperAdminCount(client) <= 1) {
        await rollback(client); return "last_super_admin" as const;
      }
      await client.query("update staff_accounts set active = $2, updated_at = $3 where id = $1", [input.targetStaffAccountId, input.active, input.changedAt]);
      await client.query("update inquiry_team_members set active = $2, updated_at = $3 where id = $1", [targetIdentity.teamMemberId, input.active, input.changedAt]);
      if (!input.active) {
        await client.query("update staff_sessions set revoked_at = $2 where staff_account_id = $1 and revoked_at is null", [input.targetStaffAccountId, input.changedAt]);
      }
      await client.query("commit");
      return "changed" as const;
    } catch { await rollback(client); throw new StaffAuthenticationPersistenceError(); }
    finally { client.release(); }
  }

  async bootstrapSuperAdmin(input: Parameters<StaffManagementRepository["bootstrapSuperAdmin"]>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock($1)", [staffAdministrationLockKey]);
      if (await activeSuperAdminCount(client) > 0) { await rollback(client); return "already_bootstrapped" as const; }
      const identities = await identitiesForUpdate(client, [input.targetStaffAccountId]);
      const target = identities[0];
      if (!target) { await rollback(client); return "not_found" as const; }
      if (!target.accountActive || !target.teamMemberActive || target.role !== "ADMIN") { await rollback(client); return "ineligible" as const; }
      await client.query("update staff_accounts set role = 'SUPER_ADMIN', updated_at = $2 where id = $1", [input.targetStaffAccountId, input.changedAt]);
      await client.query("commit");
      return "promoted" as const;
    } catch { await rollback(client); throw new StaffAuthenticationPersistenceError(); }
    finally { client.release(); }
  }
}
