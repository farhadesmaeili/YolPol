import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import type {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";

import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";
import {ConsumeTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/consume-telegram-connection-request";
import {CreateOwnTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/create-own-telegram-connection-request";
import {DisconnectOwnTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/disconnect-own-telegram";
import {ForceDisconnectStaffTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/force-disconnect-staff-telegram";
import {ResolveTelegramStaffActor} from "@/features/telegram-staff-onboarding/application/use-cases/resolve-telegram-staff-actor";
import {RevokeStaffTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/revoke-staff-telegram-connection-request";
import {PostgresTelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/infrastructure/persistence/postgres/repositories/postgres-telegram-staff-onboarding-repository";
import {telegramStaffOnboardingPostgresSchema} from "@/features/telegram-staff-onboarding/infrastructure/persistence/postgres/schema/telegram-staff-onboarding-schema";
import {NodeTelegramConnectionTokenService, NodeTelegramStaffOnboardingIdGenerator} from "@/features/telegram-staff-onboarding/infrastructure/security/telegram-connection-token-service";

let pool: Pool;
let repository: PostgresTelegramStaffOnboardingRepository;
const authorization = new StaffAuthorizationPolicy();
const tokens = new NodeTelegramConnectionTokenService();
const ids = new NodeTelegramStaffOnboardingIdGenerator();
const clock = {now: () => new Date()};

async function cleanTables() {
  await pool.query("truncate table telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, inquiry_assignments, inquiry_team_members");
}

async function seedAccount(id: string, role: StaffRole, active = true, teamMemberActive = active): Promise<StaffPrincipal> {
  const teamMemberId = `member-${id}`;
  const now = new Date();
  await pool.query("insert into inquiry_team_members (id,display_name,active,created_at,updated_at) values ($1,$2,$3,$4,$4)", [teamMemberId, `${role} ${id}`, teamMemberActive, now]);
  await pool.query("insert into staff_accounts (id,team_member_id,normalized_email,password_hash,role,active,created_at,updated_at) values ($1,$2,$3,'stored-hash',$4,$5,$6,$6)", [id, teamMemberId, `${id}@example.test`, role, active, now]);
  return {staffAccountId: id, teamMemberId, role, displayName: `${role} ${id}`, actorReference: `staff:${teamMemberId}`};
}

function createUseCase() {
  return new CreateOwnTelegramConnectionRequest(repository, tokens, authorization, clock);
}

function consumeUseCase() {
  return new ConsumeTelegramConnectionRequest(repository, tokens, ids, authorization);
}

async function issue(principal: StaffPrincipal): Promise<string> {
  const result = await createUseCase().execute({principal});
  if (result.status !== "created") throw new Error("Test connection request was not created.");
  return result.connectionToken;
}

beforeAll(async () => {
  pool = createPostgresPool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: telegramStaffOnboardingPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  repository = new PostgresTelegramStaffOnboardingRepository(pool);
});

beforeEach(async () => {
  const identity = await pool.query<{current_database: string; current_user: string}>("select current_database(), current_user");
  expect(identity.rows[0]).toEqual({current_database: "yolpol_integration", current_user: "yolpol_test"});
  await cleanTables();
});

afterEach(cleanTables);
afterAll(async () => { if (pool) await pool.end(); });

describe("PostgresTelegramStaffOnboardingRepository", () => {
  it("persists only token digests and evaluates expiry after waiting for the request lock", async () => {
    const principal = await seedAccount("sales", "SALES");
    const credential = await issue(principal);
    const stored = await pool.query<Record<string, unknown>>("select * from telegram_connection_requests");
    expect(stored.rows).toHaveLength(1);
    expect(JSON.stringify(stored.rows[0])).not.toContain(credential);
    expect(stored.rows[0]?.token_lookup).toMatch(/^[a-f0-9]{64}$/u);
    expect(stored.rows[0]?.token_verification).toMatch(/^[a-f0-9]{64}$/u);

    await pool.query("update telegram_connection_requests set expires_at = clock_timestamp() + interval '200 milliseconds'");
    const blocker = await pool.connect();
    try {
      await blocker.query("begin");
      await blocker.query("select id from telegram_connection_requests for update");
      const delayed = consumeUseCase().execute({connectionToken: credential, telegramUserId: "1001", privateChatId: "2001"});
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
      await blocker.query("commit");
      await expect(delayed).resolves.toEqual({status: "unavailable"});
    } finally {
      try { await blocker.query("rollback"); } catch { /* The transaction may already be committed. */ }
      blocker.release();
    }
    expect((await pool.query("select id from telegram_staff_links")).rowCount).toBe(0);
    expect((await pool.query("select consumed_at from telegram_connection_requests")).rows[0]?.consumed_at).toBeNull();
  });

  it("atomically consumes once when different Telegram users race for one Staff request", async () => {
    const principal = await seedAccount("sales", "SALES");
    const credential = await issue(principal);
    const results = await Promise.all([
      consumeUseCase().execute({connectionToken: credential, telegramUserId: "1001", privateChatId: "2001"}),
      consumeUseCase().execute({connectionToken: credential, telegramUserId: "1002", privateChatId: "2002"}),
    ]);
    expect(results.filter(({status}) => status === "connected")).toHaveLength(1);
    expect(results.filter(({status}) => status === "unavailable")).toHaveLength(1);
    expect((await pool.query("select id from telegram_staff_links where disconnected_at is null")).rowCount).toBe(1);
    expect((await pool.query("select id from telegram_connection_requests where consumed_at is not null")).rowCount).toBe(1);
    await expect(consumeUseCase().execute({connectionToken: credential, telegramUserId: "1001", privateChatId: "2001"})).resolves.toEqual({status: "unavailable"});
  });

  it("permits exactly one historical owner when the same Telegram User races across Staff", async () => {
    const first = await seedAccount("first", "SALES");
    const second = await seedAccount("second", "SALES");
    const firstCredential = await issue(first);
    const secondCredential = await issue(second);
    const results = await Promise.all([
      consumeUseCase().execute({connectionToken: firstCredential, telegramUserId: "9007199254740993", privateChatId: "3001"}),
      consumeUseCase().execute({connectionToken: secondCredential, telegramUserId: "9007199254740993", privateChatId: "3002"}),
    ]);
    expect(results.filter(({status}) => status === "connected")).toHaveLength(1);
    expect(results.filter(({status}) => status === "unavailable")).toHaveLength(1);
    expect((await pool.query("select id from telegram_staff_links where telegram_user_id = 9007199254740993")).rowCount).toBe(1);
    expect((await pool.query("select id from telegram_connection_requests where consumed_at is not null")).rowCount).toBe(1);
    expect((await pool.query("select id from telegram_connection_requests where consumed_at is null and revoked_at is null")).rowCount).toBe(1);
  });

  it("preserves history across self disconnect and reconnects same or never-owned identities", async () => {
    const principal = await seedAccount("sales", "SALES");
    const disconnect = new DisconnectOwnTelegram(repository, authorization);
    const firstCredential = await issue(principal);
    await consumeUseCase().execute({connectionToken: firstCredential, telegramUserId: "1001", privateChatId: "2001"});
    await expect(disconnect.execute({principal})).resolves.toEqual({status: "disconnected"});

    const sameCredential = await issue(principal);
    await expect(consumeUseCase().execute({connectionToken: sameCredential, telegramUserId: "1001", privateChatId: "2002"})).resolves.toEqual({status: "connected"});
    expect((await pool.query("select id, first_linked_at, connected_at, private_chat_id::text from telegram_staff_links where telegram_user_id=1001")).rows).toHaveLength(1);

    await disconnect.execute({principal});
    const differentCredential = await issue(principal);
    await expect(consumeUseCase().execute({connectionToken: differentCredential, telegramUserId: "1002", privateChatId: "2003"})).resolves.toEqual({status: "connected"});
    expect((await pool.query("select id from telegram_staff_links where team_member_id=$1", [principal.teamMemberId])).rowCount).toBe(2);

    const other = await seedAccount("other", "SALES");
    const otherCredential = await issue(other);
    await expect(consumeUseCase().execute({connectionToken: otherCredential, telegramUserId: "1001", privateChatId: "3001"})).resolves.toEqual({status: "unavailable"});
  });

  it("enforces manager target policy transactionally and revokes requests on force disconnect", async () => {
    const superAdmin = await seedAccount("super", "SUPER_ADMIN");
    const admin = await seedAccount("admin", "ADMIN");
    const sales = await seedAccount("sales", "SALES");
    const targetAdmin = await seedAccount("target-admin", "ADMIN");
    const salesCredential = await issue(sales);
    await consumeUseCase().execute({connectionToken: salesCredential, telegramUserId: "1001", privateChatId: "2001"});
    await issue(sales);

    const force = new ForceDisconnectStaffTelegram(repository, authorization);
    await expect(force.execute({principal: admin, targetStaffAccountId: sales.staffAccountId})).resolves.toEqual({status: "disconnected"});
    expect((await pool.query("select id from telegram_staff_links where team_member_id=$1 and disconnected_at is null", [sales.teamMemberId])).rowCount).toBe(0);
    expect((await pool.query("select id from telegram_connection_requests where staff_account_id=$1 and consumed_at is null and revoked_at is null", [sales.staffAccountId])).rowCount).toBe(0);

    const targetCredential = await issue(targetAdmin);
    await consumeUseCase().execute({connectionToken: targetCredential, telegramUserId: "1002", privateChatId: "2002"});
    await expect(force.execute({principal: admin, targetStaffAccountId: targetAdmin.staffAccountId})).resolves.toEqual({status: "unavailable"});
    expect((await pool.query("select id from telegram_staff_links where team_member_id=$1 and disconnected_at is null", [targetAdmin.teamMemberId])).rowCount).toBe(1);
    await expect(force.execute({principal: superAdmin, targetStaffAccountId: targetAdmin.staffAccountId})).resolves.toEqual({status: "disconnected"});

    await issue(sales);
    const revoke = new RevokeStaffTelegramConnectionRequest(repository, authorization);
    await expect(revoke.execute({principal: admin, targetStaffAccountId: sales.staffAccountId})).resolves.toEqual({status: "revoked"});
    expect((await pool.query("select id from telegram_connection_requests where staff_account_id=$1 and consumed_at is null and revoked_at is null", [sales.staffAccountId])).rowCount).toBe(0);
    await issue(targetAdmin);
    await expect(revoke.execute({principal: admin, targetStaffAccountId: targetAdmin.staffAccountId})).resolves.toEqual({status: "unavailable"});
    const targetAdminRequestStates = await pool.query<{consumed: string; outstanding: string; revoked: string}>(`
      select
        count(*) filter (where consumed_at is not null and revoked_at is null)::text as consumed,
        count(*) filter (where consumed_at is null and revoked_at is null)::text as outstanding,
        count(*) filter (where revoked_at is not null)::text as revoked
      from telegram_connection_requests where staff_account_id=$1
    `, [targetAdmin.staffAccountId]);
    expect(targetAdminRequestStates.rows).toEqual([{consumed: "1", outstanding: "1", revoked: "0"}]);
  });

  it("projects current role/capability and leaves communication recipients unchanged", async () => {
    const principal = await seedAccount("sales", "SALES");
    await pool.query(`
      insert into communication_recipients (id,channel,kind,external_id,display_name,team_member_id,authorized,notifications_enabled,created_at,updated_at)
      values ('recipient-1','TELEGRAM','TEAM_MEMBER','legacy-delivery-id','Legacy delivery',$1,true,false,clock_timestamp(),clock_timestamp())
    `, [principal.teamMemberId]);
    const before = (await pool.query("select channel,kind,external_id,team_member_id,authorized,notifications_enabled from communication_recipients where id='recipient-1'")).rows[0];
    const credential = await issue(principal);
    await consumeUseCase().execute({connectionToken: credential, telegramUserId: "1001", privateChatId: "2001"});
    await pool.query("update staff_accounts set role='VIEWER', updated_at=clock_timestamp() where id=$1", [principal.staffAccountId]);

    const resolved = await new ResolveTelegramStaffActor(repository, authorization).execute({telegramUserId: "1001"});
    expect(resolved.status).toBe("resolved");
    if (resolved.status === "resolved") {
      expect(resolved.actor.principal.role).toBe("VIEWER");
      expect(resolved.actor.capabilities.mayReplyToCustomerConversation).toBe(false);
    }
    expect((await pool.query("select channel,kind,external_id,team_member_id,authorized,notifications_enabled from communication_recipients where id='recipient-1'")).rows[0]).toEqual(before);
    await pool.query("update staff_accounts set active=false, updated_at=clock_timestamp() where id=$1", [principal.staffAccountId]);
    await expect(new ResolveTelegramStaffActor(repository, authorization).execute({telegramUserId: "1001"})).resolves.toEqual({status: "unresolved"});
  });

  it("enforces database lifecycle, active-link, private-chat, and historical-user constraints", async () => {
    const first = await seedAccount("first", "SALES");
    const second = await seedAccount("second", "SALES");
    await pool.query(`
      insert into telegram_staff_links (id,team_member_id,telegram_user_id,private_chat_id,first_linked_at,connected_at,disconnected_at,updated_at)
      values ('link-1',$1,1001,2001,clock_timestamp(),clock_timestamp(),null,clock_timestamp())
    `, [first.teamMemberId]);
    await expect(pool.query(`
      insert into telegram_staff_links (id,team_member_id,telegram_user_id,private_chat_id,first_linked_at,connected_at,disconnected_at,updated_at)
      values ('link-active-team',$1,1002,2002,clock_timestamp(),clock_timestamp(),null,clock_timestamp())
    `, [first.teamMemberId])).rejects.toMatchObject({code: "23505"});
    await expect(pool.query(`
      insert into telegram_staff_links (id,team_member_id,telegram_user_id,private_chat_id,first_linked_at,connected_at,disconnected_at,updated_at)
      values ('link-private-chat',$1,1003,2001,clock_timestamp(),clock_timestamp(),null,clock_timestamp())
    `, [second.teamMemberId])).rejects.toMatchObject({code: "23505"});
    await pool.query("update telegram_staff_links set disconnected_at=clock_timestamp(), updated_at=clock_timestamp() where id='link-1'");
    await expect(pool.query(`
      insert into telegram_staff_links (id,team_member_id,telegram_user_id,private_chat_id,first_linked_at,connected_at,disconnected_at,updated_at)
      values ('link-history',$1,1001,2003,clock_timestamp(),clock_timestamp(),null,clock_timestamp())
    `, [second.teamMemberId])).rejects.toMatchObject({code: "23505"});
    await expect(pool.query(`
      insert into telegram_staff_links (id,team_member_id,telegram_user_id,private_chat_id,first_linked_at,connected_at,disconnected_at,updated_at)
      values ('link-invalid-life',$1,1004,2004,clock_timestamp(),clock_timestamp() - interval '1 minute',null,clock_timestamp())
    `, [second.teamMemberId])).rejects.toMatchObject({code: "23514"});
  });
});
