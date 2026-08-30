import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import type {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";

import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {ResolveStaffConversationActor} from "@/features/staff-authentication/application/use-cases/resolve-staff-conversation-actor";
import {ResolveStaffSession} from "@/features/staff-authentication/application/use-cases/resolve-staff-session";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {PostgresStaffAccountRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-account-repository";
import {PostgresStaffManagementRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-management-repository";
import {PostgresStaffSessionRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-session-repository";
import {staffAuthenticationPostgresSchema} from "@/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema";
import {FakeStaffSessionTokenService} from "@/features/staff-authentication/testing/fakes/staff-authentication-fakes";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";

const now = new Date("2026-08-29T08:00:00.000Z");
const changedAt = new Date(now.getTime() + 1_000);
const sessionCredential = `yps_${"A".repeat(43)}`;
let pool: Pool;
let repository: PostgresStaffManagementRepository;

async function cleanTables() {
  await pool.query("truncate table telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, inquiry_assignments, inquiry_team_members");
}

async function seedAccount(id: string, role: StaffRole, options: Readonly<{
  accountActive?: boolean;
  teamMemberActive?: boolean;
  passwordHash?: string;
}> = {}) {
  const teamMemberId = `member-${id}`;
  await pool.query(
    "insert into inquiry_team_members (id,display_name,active,created_at,updated_at) values ($1,$2,$3,$4,$4)",
    [teamMemberId, id, options.teamMemberActive ?? true, now],
  );
  await pool.query(
    "insert into staff_accounts (id,team_member_id,normalized_email,password_hash,role,active,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$7)",
    [id, teamMemberId, `${id}@example.test`, options.passwordHash ?? `stored-hash-${id}`, role, options.accountActive ?? true, now],
  );
  return teamMemberId;
}

async function activeSuperAdminCount(): Promise<number> {
  const result = await pool.query<{count: string}>(`
    select count(*)::text as count
    from staff_accounts sa
    join inquiry_team_members tm on tm.id = sa.team_member_id
    where sa.role = 'SUPER_ADMIN' and sa.active = true and tm.active = true
  `);
  return Number(result.rows[0]?.count);
}

beforeAll(async () => {
  pool = createPostgresPool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: staffAuthenticationPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  repository = new PostgresStaffManagementRepository(pool);
});

beforeEach(async () => {
  const identity = await pool.query<{current_database: string; current_user: string}>("select current_database(), current_user");
  expect(identity.rows[0]).toEqual({current_database: "yolpol_integration", current_user: "yolpol_test"});
  await cleanTables();
});

afterEach(cleanTables);
afterAll(async () => { if (pool) await pool.end(); });

describe("first Super Admin bootstrap", () => {
  it("promotes an eligible active ADMIN and rejects missing, inactive, and wrong-role targets", async () => {
    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "missing", changedAt})).resolves.toBe("not_found");

    await seedAccount("inactive-account", "ADMIN", {accountActive: false});
    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "inactive-account", changedAt})).resolves.toBe("ineligible");

    await seedAccount("inactive-member", "ADMIN", {teamMemberActive: false});
    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "inactive-member", changedAt})).resolves.toBe("ineligible");

    for (const role of ["SALES", "VIEWER"] as const) {
      const id = `wrong-${role.toLowerCase()}`;
      await seedAccount(id, role);
      await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: id, changedAt})).resolves.toBe("ineligible");
    }

    await seedAccount("eligible", "ADMIN");
    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "eligible", changedAt})).resolves.toBe("promoted");
    await expect(pool.query("select role from staff_accounts where id = 'eligible'")).resolves.toMatchObject({rows: [{role: "SUPER_ADMIN"}]});
    expect(await activeSuperAdminCount()).toBe(1);
  });

  it("rejects a SUPER_ADMIN target and any target once an active SUPER_ADMIN exists", async () => {
    await seedAccount("existing-super", "SUPER_ADMIN");
    await seedAccount("other-admin", "ADMIN");

    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "existing-super", changedAt})).resolves.toBe("already_bootstrapped");
    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "other-admin", changedAt})).resolves.toBe("already_bootstrapped");
    await expect(pool.query("select id,role from staff_accounts order by id")).resolves.toMatchObject({
      rows: [
        {id: "existing-super", role: "SUPER_ADMIN"},
        {id: "other-admin", role: "ADMIN"},
      ],
    });
  });

  it("changes only role and updated_at while the same session and Telegram actor gain current SUPER_ADMIN authorization", async () => {
    const teamMemberId = await seedAccount("eligible", "ADMIN", {passwordHash: "preserved-password-hash"});
    await pool.query(`
      insert into staff_sessions (id,staff_account_id,token_lookup,token_verification,created_at,expires_at,revoked_at)
      values ('session-existing','eligible',$1,$2,$3,$4,null)
    `, ["a".repeat(64), "b".repeat(64), now, new Date(now.getTime() + 60_000)]);
    await pool.query(`
      insert into staff_invitations (
        id,normalized_email,display_name,target_role,token_lookup,token_verification,
        created_by_staff_account_id,created_at,expires_at,consumed_at,revoked_at
      ) values ('invitation-existing','invited@example.test','Invited','SALES',$1,$2,'eligible',$3,$4,null,null)
    `, ["c".repeat(64), "d".repeat(64), now, new Date(now.getTime() + 60_000)]);
    await pool.query(`
      insert into communication_recipients (
        id,channel,kind,external_id,display_name,team_member_id,authorized,notifications_enabled,created_at,updated_at
      ) values ('telegram-mapping','TELEGRAM','TEAM_MEMBER','123456','Eligible',$1,true,true,$2,$2)
    `, [teamMemberId, now]);

    const sessions = new PostgresStaffSessionRepository(pool);
    const tokens = new FakeStaffSessionTokenService();
    const resolveSession = new ResolveStaffSession(sessions, tokens, {now: () => new Date(now.getTime() + 2_000)});
    const accounts = new PostgresStaffAccountRepository(pool);
    const authorization = new StaffAuthorizationPolicy();
    const resolveActor = new ResolveStaffConversationActor(accounts, authorization);
    const before = {
      account: (await pool.query("select * from staff_accounts where id = 'eligible'")).rows[0],
      teamMember: (await pool.query("select * from inquiry_team_members where id = $1", [teamMemberId])).rows[0],
      sessions: (await pool.query("select * from staff_sessions where staff_account_id = 'eligible' order by id")).rows,
      invitations: (await pool.query("select * from staff_invitations order by id")).rows,
      mappings: (await pool.query("select * from communication_recipients order by id")).rows,
    };
    await expect(resolveSession.execute({sessionCredential})).resolves.toMatchObject({status: "authenticated", principal: {role: "ADMIN"}});
    await expect(resolveActor.execute({teamMemberId})).resolves.toBe(`staff:${teamMemberId}`);

    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "eligible", changedAt})).resolves.toBe("promoted");

    const afterAccount = (await pool.query("select * from staff_accounts where id = 'eligible'")).rows[0];
    expect(afterAccount).toEqual({...before.account, role: "SUPER_ADMIN", updated_at: changedAt});
    expect(afterAccount.updated_at).not.toEqual(before.account.updated_at);
    expect((await pool.query("select * from inquiry_team_members where id = $1", [teamMemberId])).rows[0]).toEqual(before.teamMember);
    expect((await pool.query("select * from staff_sessions where staff_account_id = 'eligible' order by id")).rows).toEqual(before.sessions);
    expect((await pool.query("select * from staff_invitations order by id")).rows).toEqual(before.invitations);
    expect((await pool.query("select * from communication_recipients order by id")).rows).toEqual(before.mappings);
    await expect(resolveSession.execute({sessionCredential})).resolves.toMatchObject({status: "authenticated", principal: {role: "SUPER_ADMIN"}});
    const currentAuthorization = await accounts.findAuthorizationByTeamMemberId(teamMemberId);
    expect(currentAuthorization).toMatchObject({role: "SUPER_ADMIN", teamMemberId});
    if (!currentAuthorization) throw new Error("Expected current Staff authorization.");
    const principal = Object.freeze({
      staffAccountId: currentAuthorization.staffAccountId,
      teamMemberId: currentAuthorization.teamMemberId,
      role: currentAuthorization.role,
      displayName: currentAuthorization.teamMemberDisplayName,
      actorReference: `staff:${currentAuthorization.teamMemberId}`,
    });
    expect(authorization.mayReplyToCustomerConversation(principal)).toBe(true);
    await expect(resolveActor.execute({teamMemberId})).resolves.toBe(`staff:${teamMemberId}`);
  });

  it("allows exactly one repeated bootstrap and never promotes the second identity", async () => {
    await seedAccount("first", "ADMIN");
    await seedAccount("second", "ADMIN");

    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "first", changedAt})).resolves.toBe("promoted");
    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "second", changedAt: new Date(changedAt.getTime() + 1_000)})).resolves.toBe("already_bootstrapped");
    await expect(pool.query("select id,role from staff_accounts order by id")).resolves.toMatchObject({
      rows: [
        {id: "first", role: "SUPER_ADMIN"},
        {id: "second", role: "ADMIN"},
      ],
    });
  });

  it("serializes concurrent bootstrap transactions so exactly one succeeds", async () => {
    await seedAccount("candidate-a", "ADMIN");
    await seedAccount("candidate-b", "ADMIN");

    const results = await Promise.all([
      repository.bootstrapSuperAdmin({targetStaffAccountId: "candidate-a", changedAt}),
      repository.bootstrapSuperAdmin({targetStaffAccountId: "candidate-b", changedAt}),
    ]);

    expect(results.filter((result) => result === "promoted")).toHaveLength(1);
    expect(results.filter((result) => result === "already_bootstrapped")).toHaveLength(1);
    expect(await activeSuperAdminCount()).toBe(1);
  });

  it("rolls back completely when the role update fails after the transaction starts", async () => {
    const teamMemberId = await seedAccount("rollback-target", "ADMIN");
    await pool.query(`
      insert into staff_sessions (id,staff_account_id,token_lookup,token_verification,created_at,expires_at,revoked_at)
      values ('rollback-session','rollback-target',$1,$2,$3,$4,null)
    `, ["e".repeat(64), "f".repeat(64), now, new Date(now.getTime() + 60_000)]);
    await pool.query(`
      insert into staff_invitations (
        id,normalized_email,display_name,target_role,token_lookup,token_verification,
        created_by_staff_account_id,created_at,expires_at,consumed_at,revoked_at
      ) values ('rollback-invitation','rollback@example.test','Rollback','SALES',$1,$2,'rollback-target',$3,$4,null,null)
    `, ["1".repeat(64), "2".repeat(64), now, new Date(now.getTime() + 60_000)]);
    const before = {
      account: (await pool.query("select * from staff_accounts where id = 'rollback-target'")).rows[0],
      teamMember: (await pool.query("select * from inquiry_team_members where id = $1", [teamMemberId])).rows[0],
      sessions: (await pool.query("select * from staff_sessions order by id")).rows,
      invitations: (await pool.query("select * from staff_invitations order by id")).rows,
      accountCount: (await pool.query<{count: string}>("select count(*)::text as count from staff_accounts")).rows[0]?.count,
      teamMemberCount: (await pool.query<{count: string}>("select count(*)::text as count from inquiry_team_members")).rows[0]?.count,
    };

    await pool.query("alter table staff_accounts add constraint staff_accounts_test_reject_super_admin check (role <> 'SUPER_ADMIN')");
    try {
      await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "rollback-target", changedAt})).rejects.toThrow();
    } finally {
      await pool.query("alter table staff_accounts drop constraint if exists staff_accounts_test_reject_super_admin");
    }

    expect((await pool.query("select * from staff_accounts where id = 'rollback-target'")).rows[0]).toEqual(before.account);
    expect((await pool.query("select * from inquiry_team_members where id = $1", [teamMemberId])).rows[0]).toEqual(before.teamMember);
    expect((await pool.query("select * from staff_sessions order by id")).rows).toEqual(before.sessions);
    expect((await pool.query("select * from staff_invitations order by id")).rows).toEqual(before.invitations);
    expect((await pool.query<{count: string}>("select count(*)::text as count from staff_accounts")).rows[0]?.count).toBe(before.accountCount);
    expect((await pool.query<{count: string}>("select count(*)::text as count from inquiry_team_members")).rows[0]?.count).toBe(before.teamMemberCount);
    expect(await activeSuperAdminCount()).toBe(0);
  });

  it("protects the sole bootstrap identity and permits safe lifecycle changes after a second SUPER_ADMIN is promoted", async () => {
    await seedAccount("first-super", "ADMIN");
    await seedAccount("second-super", "ADMIN");
    await expect(repository.bootstrapSuperAdmin({targetStaffAccountId: "first-super", changedAt})).resolves.toBe("promoted");

    await expect(repository.setActive({
      actorStaffAccountId: "first-super", targetStaffAccountId: "first-super", active: false,
      changedAt: new Date(changedAt.getTime() + 1_000), authorize: () => true,
    })).resolves.toBe("last_super_admin");
    await expect(repository.changeRole({
      actorStaffAccountId: "first-super", targetStaffAccountId: "first-super", newRole: "ADMIN",
      changedAt: new Date(changedAt.getTime() + 1_000), authorize: () => true,
    })).resolves.toBe("last_super_admin");

    await expect(repository.changeRole({
      actorStaffAccountId: "first-super", targetStaffAccountId: "second-super", newRole: "SUPER_ADMIN",
      changedAt: new Date(changedAt.getTime() + 2_000), authorize: () => true,
    })).resolves.toBe("changed");
    await expect(repository.changeRole({
      actorStaffAccountId: "second-super", targetStaffAccountId: "first-super", newRole: "ADMIN",
      changedAt: new Date(changedAt.getTime() + 3_000), authorize: () => true,
    })).resolves.toBe("changed");
    expect(await activeSuperAdminCount()).toBe(1);

    await expect(repository.changeRole({
      actorStaffAccountId: "second-super", targetStaffAccountId: "first-super", newRole: "SUPER_ADMIN",
      changedAt: new Date(changedAt.getTime() + 4_000), authorize: () => true,
    })).resolves.toBe("changed");
    await expect(repository.setActive({
      actorStaffAccountId: "second-super", targetStaffAccountId: "first-super", active: false,
      changedAt: new Date(changedAt.getTime() + 5_000), authorize: () => true,
    })).resolves.toBe("changed");
    expect(await activeSuperAdminCount()).toBe(1);
  });

  it("serializes bootstrap against sole-SUPER_ADMIN demotion and deactivation", async () => {
    for (const lifecycle of ["demote", "deactivate"] as const) {
      await cleanTables();
      await seedAccount("established-super", "SUPER_ADMIN");
      await seedAccount("bootstrap-candidate", "ADMIN");

      const lifecycleResult = lifecycle === "demote"
        ? repository.changeRole({
            actorStaffAccountId: "established-super", targetStaffAccountId: "established-super", newRole: "ADMIN",
            changedAt, authorize: () => true,
          })
        : repository.setActive({
            actorStaffAccountId: "established-super", targetStaffAccountId: "established-super", active: false,
            changedAt, authorize: () => true,
          });
      const [bootstrap, mutation] = await Promise.all([
        repository.bootstrapSuperAdmin({targetStaffAccountId: "bootstrap-candidate", changedAt}),
        lifecycleResult,
      ]);

      expect(bootstrap).toBe("already_bootstrapped");
      expect(mutation).toBe("last_super_admin");
      expect(await activeSuperAdminCount()).toBe(1);
    }
  });
});
