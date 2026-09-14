import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import type {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";
import {
  ConsumeTelegramGroupConnectionRequest,
  CreateTelegramGroupConnectionRequest,
  ListNotificationDestinations,
  SetTeamMemberNotifications,
  SetTelegramGroupDestination,
} from "@/features/notification-destinations/application/use-cases/notification-destination-use-cases";
import {PostgresNotificationDestinationRepository} from "@/features/notification-destinations/infrastructure/persistence/postgres/repositories/postgres-notification-destination-repository";
import {notificationDestinationPostgresSchema} from "@/features/notification-destinations/infrastructure/persistence/postgres/schema/notification-destination-schema";
import {NodeNotificationDestinationIdGenerator, NodeTelegramGroupTokenService} from "@/features/notification-destinations/infrastructure/security/telegram-group-token-service";
import {DisconnectOwnTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/disconnect-own-telegram";
import {PostgresTelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/infrastructure/persistence/postgres/repositories/postgres-telegram-staff-onboarding-repository";

let pool: Pool;
let repository: PostgresNotificationDestinationRepository;
const authorization = new StaffAuthorizationPolicy();
const tokens = new NodeTelegramGroupTokenService();
const ids = new NodeNotificationDestinationIdGenerator();

async function clean() {
  await pool.query("truncate table communication_recipient_events, telegram_group_connection_requests, telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, inquiry_assignments, inquiry_team_members");
}

async function seedAccount(id: string, role: StaffRole, telegramUserId?: string): Promise<StaffPrincipal> {
  const teamMemberId = `member-${id}`; const now = new Date();
  await pool.query("insert into inquiry_team_members (id,display_name,active,created_at,updated_at) values ($1,$2,true,$3,$3)", [teamMemberId, `${role} ${id}`, now]);
  await pool.query("insert into staff_accounts (id,team_member_id,normalized_email,password_hash,role,active,created_at,updated_at) values ($1,$2,$3,'stored-hash',$4,true,$5,$5)", [id, teamMemberId, `${id}@example.test`, role, now]);
  if (telegramUserId) await pool.query("insert into telegram_staff_links (id,team_member_id,telegram_user_id,private_chat_id,first_linked_at,connected_at,updated_at) values ($1,$2,$3,$3,$4,$4,$4)", [`link-${id}`, teamMemberId, telegramUserId, now]);
  return {staffAccountId: id, teamMemberId, role, displayName: `${role} ${id}`, actorReference: `staff:${teamMemberId}`};
}

beforeAll(async () => {
  pool = createPostgresPool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: notificationDestinationPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  repository = new PostgresNotificationDestinationRepository(pool);
});
beforeEach(async () => { const identity = await pool.query<{current_database: string; current_user: string}>("select current_database(),current_user"); expect(identity.rows[0]).toEqual({current_database: "yolpol_integration", current_user: "yolpol_test"}); await clean(); });
afterEach(clean);
afterAll(async () => { if (pool) await pool.end(); });

describe("PostgresNotificationDestinationRepository", () => {
  it("derives TEAM_MEMBER delivery only from a verified link, preserves opt-in state, and invalidates it atomically on disconnect", async () => {
    const admin = await seedAccount("admin", "ADMIN", "1001");
    const sales = await seedAccount("sales", "SALES", "2001");
    const unlinked = await seedAccount("viewer", "VIEWER");
    const useCase = new SetTeamMemberNotifications(repository, authorization, ids);
    await expect(useCase.execute({principal: admin, targetStaffAccountId: unlinked.staffAccountId, enabled: true})).resolves.toEqual({status: "unavailable"});
    await expect(useCase.execute({principal: admin, targetStaffAccountId: sales.staffAccountId, enabled: true})).resolves.toEqual({status: "changed"});
    let rows = await pool.query("select kind,external_id,team_member_id,authorized,notifications_enabled from communication_recipients");
    expect(rows.rows).toEqual([{kind: "TEAM_MEMBER", external_id: "2001", team_member_id: sales.teamMemberId, authorized: true, notifications_enabled: true}]);
    await expect(useCase.execute({principal: admin, targetStaffAccountId: sales.staffAccountId, enabled: false})).resolves.toEqual({status: "changed"});
    await expect(useCase.execute({principal: admin, targetStaffAccountId: sales.staffAccountId, enabled: true})).resolves.toEqual({status: "changed"});
    expect((await pool.query("select count(*)::int as count from communication_recipients")).rows[0]).toEqual({count: 1});

    const disconnect = new DisconnectOwnTelegram(new PostgresTelegramStaffOnboardingRepository(pool), authorization);
    await expect(disconnect.execute({principal: sales})).resolves.toEqual({status: "disconnected"});
    rows = await pool.query("select authorized,notifications_enabled from communication_recipients");
    expect(rows.rows).toEqual([{authorized: false, notifications_enabled: false}]);
    await pool.query("update telegram_staff_links set disconnected_at=null,connected_at=clock_timestamp(),updated_at=clock_timestamp(),private_chat_id=2999 where team_member_id=$1", [sales.teamMemberId]);
    expect((await pool.query("select authorized,notifications_enabled,external_id from communication_recipients")).rows).toEqual([{authorized: false, notifications_enabled: false, external_id: "2001"}]);
    expect((await pool.query("select event_type from communication_recipient_events order by occurred_at,id")).rows.map((row) => row.event_type)).toEqual(["TEAM_MEMBER_ENABLED", "TEAM_MEMBER_DISABLED", "TEAM_MEMBER_ENABLED", "TEAM_MEMBER_LINK_DISCONNECTED"]);
  });

  it("authorizes a group once for the bound manager, reuses its recipient, and preserves disable/disconnect history", async () => {
    const admin = await seedAccount("admin", "ADMIN", "1001");
    await seedAccount("other", "ADMIN", "1002");
    const create = new CreateTelegramGroupConnectionRequest(repository, tokens, authorization, {now: () => new Date()});
    const consume = new ConsumeTelegramGroupConnectionRequest(repository, tokens, ids, authorization);
    const issued = await create.execute({principal: admin});
    expect(issued.status).toBe("created");
    if (issued.status !== "created") throw new Error("Expected group request.");
    await expect(consume.execute({connectionToken: issued.connectionToken, telegramUserId: "1002", groupChatId: "-100900", displayName: "Operations"})).resolves.toEqual({status: "unavailable"});
    await expect(consume.execute({connectionToken: issued.connectionToken, telegramUserId: "1001", groupChatId: "-100900", displayName: "Operations"})).resolves.toEqual({status: "authorized"});
    await expect(consume.execute({connectionToken: issued.connectionToken, telegramUserId: "1001", groupChatId: "-100900", displayName: "Operations"})).resolves.toEqual({status: "unavailable"});

    const setGroup = new SetTelegramGroupDestination(repository, authorization, ids);
    const recipientId = (await pool.query<{id: string}>("select id from communication_recipients where kind='TEAM_GROUP'")).rows[0]!.id;
    await expect(setGroup.execute({principal: admin, recipientId, operation: "DISABLE"})).resolves.toEqual({status: "changed"});
    await expect(setGroup.execute({principal: admin, recipientId, operation: "ENABLE"})).resolves.toEqual({status: "changed"});
    await expect(setGroup.execute({principal: admin, recipientId, operation: "DISCONNECT"})).resolves.toEqual({status: "changed"});
    await expect(setGroup.execute({principal: admin, recipientId, operation: "ENABLE"})).resolves.toEqual({status: "unavailable"});

    const reissued = await create.execute({principal: admin});
    if (reissued.status !== "created") throw new Error("Expected replacement group request.");
    await expect(consume.execute({connectionToken: reissued.connectionToken, telegramUserId: "1001", groupChatId: "-100900", displayName: "Operations renamed"})).resolves.toEqual({status: "authorized"});
    expect((await pool.query("select count(*)::int as count from communication_recipients where kind='TEAM_GROUP'")).rows[0]).toEqual({count: 1});
    expect((await new ListNotificationDestinations(repository, authorization).execute(admin))).toMatchObject({status: "found", value: {groups: [{displayName: "Operations renamed", authorized: true, notificationsEnabled: true}]}});
    await expect(pool.query("update communication_recipient_events set display_name='tampered'")).rejects.toMatchObject({code: "55000"});
  });

  it("rejects expired group requests using the database clock", async () => {
    const admin = await seedAccount("admin", "ADMIN", "1001");
    const create = new CreateTelegramGroupConnectionRequest(repository, tokens, authorization, {now: () => new Date(Date.now() - 20 * 60 * 1_000)});
    const issued = await create.execute({principal: admin});
    if (issued.status !== "created") throw new Error("Expected expired test request creation.");
    await expect(new ConsumeTelegramGroupConnectionRequest(repository, tokens, ids, authorization).execute({connectionToken: issued.connectionToken, telegramUserId: "1001", groupChatId: "-100900", displayName: "Operations"})).resolves.toEqual({status: "unavailable"});
  });

  it("enforces recipient kind, authorization, and destination uniqueness invariants in PostgreSQL", async () => {
    const sales = await seedAccount("sales", "SALES", "2001");
    const insert = (values: unknown[]) => pool.query(`insert into communication_recipients
      (id,channel,kind,external_id,display_name,team_member_id,authorized,notifications_enabled,created_at,updated_at)
      values ($1,'TELEGRAM',$2,$3,'Destination',$4,$5,$6,clock_timestamp(),clock_timestamp())`, values);

    await expect(insert(["member-without-owner", "TEAM_MEMBER", "2002", null, false, false])).rejects.toMatchObject({code: "23514"});
    await expect(insert(["group-with-owner", "TEAM_GROUP", "-1001", sales.teamMemberId, false, false])).rejects.toMatchObject({code: "23514"});
    await expect(insert(["unauthorized-enabled", "TEAM_GROUP", "-1002", null, false, true])).rejects.toMatchObject({code: "23514"});
    await expect(insert(["member-one", "TEAM_MEMBER", "2001", sales.teamMemberId, true, true])).resolves.toMatchObject({rowCount: 1});
    await expect(insert(["member-two", "TEAM_MEMBER", "2002", sales.teamMemberId, false, false])).rejects.toMatchObject({code: "23505"});
    await expect(insert(["group-one", "TEAM_GROUP", "-1003", null, true, true])).resolves.toMatchObject({rowCount: 1});
    await expect(insert(["group-two", "TEAM_GROUP", "-1003", null, true, false])).rejects.toMatchObject({code: "23505"});
  });
});
