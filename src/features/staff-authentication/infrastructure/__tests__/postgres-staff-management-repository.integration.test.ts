import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import type {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";

import {ResolveStaffSession} from "@/features/staff-authentication/application/use-cases/resolve-staff-session";
import {StaffInvitation} from "@/features/staff-authentication/domain/entities/staff-invitation";
import {PostgresStaffManagementRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-management-repository";
import {PostgresStaffSessionRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-session-repository";
import {staffAuthenticationPostgresSchema} from "@/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema";
import {FakeStaffSessionTokenService} from "@/features/staff-authentication/testing/fakes/staff-authentication-fakes";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";

const now = new Date("2026-08-28T10:00:00.000Z");
let pool: Pool;
let repository: PostgresStaffManagementRepository;

async function cleanTables() {
  await pool.query("truncate table telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, inquiry_assignments, inquiry_team_members");
}

async function seedAccount(id: string, role: "SUPER_ADMIN" | "ADMIN" | "SALES" | "VIEWER", active = true) {
  const teamMemberId = `member-${id}`;
  await pool.query("insert into inquiry_team_members (id,display_name,active,created_at,updated_at) values ($1,$2,$3,$4,$4)", [teamMemberId, id, active, now]);
  await pool.query("insert into staff_accounts (id,team_member_id,normalized_email,password_hash,role,active,created_at,updated_at) values ($1,$2,$3,'stored-hash',$4,$5,$6,$6)", [id, teamMemberId, `${id}@example.test`, role, active, now]);
  return teamMemberId;
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

describe("PostgresStaffManagementRepository", () => {
  it("derives Team Telegram status only from an active canonical Staff link", async () => {
    const linkedMember = await seedAccount("linked", "SALES");
    const legacyOnlyMember = await seedAccount("legacy-only", "VIEWER");
    const disconnectedMember = await seedAccount("disconnected", "ADMIN");
    await pool.query("insert into communication_recipients (id,channel,kind,external_id,display_name,team_member_id,authorized,notifications_enabled,created_at,updated_at) values ('legacy','TELEGRAM','TEAM_MEMBER','900','Legacy',$1,true,true,$2,$2)", [legacyOnlyMember, now]);
    await pool.query("insert into telegram_staff_links (id,team_member_id,telegram_user_id,private_chat_id,first_linked_at,connected_at,disconnected_at,updated_at) values ('active-link',$1,901,901,$3,$3,null,$3),('old-link',$2,902,902,$3,$3,$3,$3)", [linkedMember, disconnectedMember, now]);
    const accounts = await repository.listAccounts();
    expect(accounts.map(({id, telegramLinked}) => ({id, telegramLinked})).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      {id: "disconnected", telegramLinked: false},
      {id: "legacy-only", telegramLinked: false},
      {id: "linked", telegramLinked: true},
    ]);
  });

  it("atomically activates one invitation and rejects replay without partial identity rows", async () => {
    await seedAccount("creator", "SUPER_ADMIN");
    const invitation = StaffInvitation.create({
      id: "invitation-1",
      normalizedEmail: "invited@example.test",
      displayName: "Invited Staff",
      targetRole: "SALES",
      tokenLookup: "a".repeat(64),
      tokenVerification: "b".repeat(64),
      createdByStaffAccountId: "creator",
      createdAt: now,
      expiresAt: new Date("2099-08-29T10:00:00.000Z"),
    });
    await expect(repository.createInvitation({invitation, authorize: () => true})).resolves.toBe("created");
    const activation = {
      invitationId: invitation.id,
      presentedVerification: invitation.tokenVerification,
      normalizedEmail: invitation.normalizedEmail,
      passwordHash: "$yolpol-scrypt$v=1$stored-password-hash",
      staffAccountId: "new-account",
      teamMemberId: "new-member",
      authorizeCreator: () => true,
    } as const;
    const beforeActivation = Date.now();
    await expect(repository.activateInvitation(activation)).resolves.toBe("activated");
    const afterActivation = Date.now();
    await expect(repository.activateInvitation({...activation, staffAccountId: "replay-account", teamMemberId: "replay-member"})).resolves.toBe("invitation_unavailable");
    await expect(pool.query("select id,role,active from staff_accounts where id = 'new-account'")).resolves.toMatchObject({rows: [{id: "new-account", role: "SALES", active: true}]});
    await expect(pool.query("select id,active from inquiry_team_members where id = 'new-member'")).resolves.toMatchObject({rows: [{id: "new-member", active: true}]});
    const consumedAt = (await pool.query("select consumed_at from staff_invitations where id = 'invitation-1'")).rows[0]?.consumed_at as Date;
    expect(consumedAt.getTime()).toBeGreaterThanOrEqual(beforeActivation);
    expect(consumedAt.getTime()).toBeLessThanOrEqual(afterActivation);
    expect((await pool.query("select id from staff_accounts where id = 'replay-account'")).rowCount).toBe(0);
    expect((await pool.query("select id from inquiry_team_members where id = 'replay-member'")).rowCount).toBe(0);
  });

  it("rejects at the database expiry boundary and after waiting on the locked invitation past expiry", async () => {
    await seedAccount("creator", "SUPER_ADMIN");
    await pool.query(`
      insert into staff_invitations (
        id, normalized_email, display_name, target_role, token_lookup, token_verification,
        created_by_staff_account_id, created_at, expires_at, consumed_at, revoked_at
      ) values
        ('boundary-invitation','boundary@example.test','Boundary','SALES',$1,$2,'creator',clock_timestamp() - interval '1 hour',clock_timestamp(),null,null),
        ('locked-invitation','locked@example.test','Locked','SALES',$3,$4,'creator',clock_timestamp() - interval '1 hour',clock_timestamp() + interval '200 milliseconds',null,null)
    `, ["c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64)]);
    const activate = (invitationId: string, normalizedEmail: string, presentedVerification: string, suffix: string) => repository.activateInvitation({
      invitationId,
      presentedVerification,
      normalizedEmail,
      passwordHash: "$yolpol-scrypt$v=1$stored-password-hash",
      staffAccountId: `account-${suffix}`,
      teamMemberId: `member-${suffix}`,
      authorizeCreator: () => true,
    });

    await expect(activate("boundary-invitation", "boundary@example.test", "d".repeat(64), "boundary")).resolves.toBe("invitation_unavailable");

    const blocker = await pool.connect();
    try {
      await blocker.query("begin");
      await blocker.query("select id from staff_invitations where id = 'locked-invitation' for update");
      const delayedActivation = activate("locked-invitation", "locked@example.test", "f".repeat(64), "locked");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
      await blocker.query("commit");
      await expect(delayedActivation).resolves.toBe("invitation_unavailable");
    } finally {
      try { await blocker.query("rollback"); } catch { /* The transaction may already be committed. */ }
      blocker.release();
    }
    expect((await pool.query("select id from staff_accounts where id in ('account-boundary','account-locked')")).rowCount).toBe(0);
  });

  it("serializes repeated activation and activation versus revocation so only one terminal action succeeds", async () => {
    await seedAccount("creator", "SUPER_ADMIN");
    const create = async (id: string, email: string, lookup: string, verification: string) => {
      const invitation = StaffInvitation.create({
        id,
        normalizedEmail: email,
        displayName: "Concurrent",
        targetRole: "SALES",
        tokenLookup: lookup,
        tokenVerification: verification,
        createdByStaffAccountId: "creator",
        createdAt: now,
        expiresAt: new Date("2099-08-29T10:00:00.000Z"),
      });
      await repository.createInvitation({invitation, authorize: () => true});
      return invitation;
    };
    const activationInput = (invitation: StaffInvitation, suffix: string) => ({
      invitationId: invitation.id,
      presentedVerification: invitation.tokenVerification,
      normalizedEmail: invitation.normalizedEmail,
      passwordHash: "$yolpol-scrypt$v=1$stored-password-hash",
      staffAccountId: `account-${suffix}`,
      teamMemberId: `member-${suffix}`,
      authorizeCreator: () => true,
    } as const);

    const repeated = await create("repeat-invitation", "repeat@example.test", "1".repeat(64), "2".repeat(64));
    const repeatedResults = await Promise.all([
      repository.activateInvitation(activationInput(repeated, "repeat-a")),
      repository.activateInvitation(activationInput(repeated, "repeat-b")),
    ]);
    expect(repeatedResults.filter((result) => result === "activated")).toHaveLength(1);
    expect(repeatedResults.filter((result) => result === "invitation_unavailable")).toHaveLength(1);

    const raced = await create("race-invitation", "race@example.test", "3".repeat(64), "4".repeat(64));
    const terminalResults = await Promise.all([
      repository.activateInvitation(activationInput(raced, "race")),
      repository.revokeInvitation({actorStaffAccountId: "creator", invitationId: raced.id, revokedAt: new Date(), authorize: () => true}),
    ]);
    expect(terminalResults.filter((result) => result === "activated" || result === "revoked")).toHaveLength(1);
    expect(terminalResults.filter((result) => result === "invitation_unavailable" || result === "unavailable")).toHaveLength(1);
  });

  it("deactivates both identity records, revokes all sessions, and never revives old sessions", async () => {
    await seedAccount("actor", "SUPER_ADMIN");
    await seedAccount("target", "SALES");
    const activeExpiresAt = new Date(now.getTime() + 60_000);
    const expiredAt = new Date(now.getTime() + 1_000);
    const previouslyRevokedAt = new Date(now.getTime() + 500);
    const deactivatedAt = new Date(now.getTime() + 2_000);
    expect(previouslyRevokedAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(expiredAt.getTime()).toBeLessThan(deactivatedAt.getTime());
    await pool.query(`
      insert into staff_sessions (id,staff_account_id,token_lookup,token_verification,created_at,expires_at,revoked_at)
      values
        ('session-1','target',$1,$2,$3,$4,null),
        ('session-2','target',$5,$6,$3,$4,$7),
        ('session-3','target',$8,$9,$3,$10,null)
    `, [
      "a".repeat(64), "b".repeat(64), now, activeExpiresAt,
      "c".repeat(64), "d".repeat(64), previouslyRevokedAt,
      "e".repeat(64), "f".repeat(64), expiredAt,
    ]);
    await expect(repository.setActive({actorStaffAccountId: "actor", targetStaffAccountId: "target", active: false, changedAt: deactivatedAt, authorize: () => true})).resolves.toBe("changed");
    await expect(pool.query("select sa.active as account_active,tm.active as member_active from staff_accounts sa join inquiry_team_members tm on tm.id=sa.team_member_id where sa.id='target'")).resolves.toMatchObject({rows: [{account_active: false, member_active: false}]});
    expect((await pool.query("select revoked_at from staff_sessions where staff_account_id='target' order by id")).rows).toEqual([
      {revoked_at: deactivatedAt},
      {revoked_at: previouslyRevokedAt},
      {revoked_at: deactivatedAt},
    ]);

    await expect(repository.setActive({actorStaffAccountId: "actor", targetStaffAccountId: "target", active: true, changedAt: new Date(now.getTime() + 3_000), authorize: () => true})).resolves.toBe("changed");
    await expect(pool.query("select sa.active as account_active,tm.active as member_active from staff_accounts sa join inquiry_team_members tm on tm.id=sa.team_member_id where sa.id='target'")).resolves.toMatchObject({rows: [{account_active: true, member_active: true}]});
    expect((await pool.query("select revoked_at from staff_sessions where staff_account_id='target' order by id")).rows).toEqual([
      {revoked_at: deactivatedAt},
      {revoked_at: previouslyRevokedAt},
      {revoked_at: deactivatedAt},
    ]);
    const resolveSession = new ResolveStaffSession(
      new PostgresStaffSessionRepository(pool),
      new FakeStaffSessionTokenService(),
      {now: () => new Date(now.getTime() + 4_000)},
    );
    await expect(resolveSession.execute({sessionCredential: `yps_${"A".repeat(43)}`})).resolves.toEqual({status: "unauthorized"});
  });

  it("serializes concurrent Super Admin removals so exactly one remains active", async () => {
    await seedAccount("super-a", "SUPER_ADMIN");
    await seedAccount("super-b", "SUPER_ADMIN");
    const [first, second] = await Promise.all([
      repository.changeRole({actorStaffAccountId: "super-a", targetStaffAccountId: "super-b", newRole: "ADMIN", changedAt: new Date(now.getTime() + 1_000), authorize: () => true}),
      repository.changeRole({actorStaffAccountId: "super-b", targetStaffAccountId: "super-a", newRole: "ADMIN", changedAt: new Date(now.getTime() + 1_000), authorize: () => true}),
    ]);
    expect([first, second].filter((result) => result === "changed")).toHaveLength(1);
    expect([first, second].filter((result) => result === "last_super_admin")).toHaveLength(1);
    const remaining = await pool.query<{count: string}>("select count(*)::text as count from staff_accounts sa join inquiry_team_members tm on tm.id=sa.team_member_id where sa.role='SUPER_ADMIN' and sa.active=true and tm.active=true");
    expect(remaining.rows[0]?.count).toBe("1");
  });
});
