import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import type {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";

import {StaffAccount} from "@/features/staff-authentication/domain/entities/staff-account";
import {StaffAuthenticationPersistenceError} from "@/features/staff-authentication/infrastructure/errors/staff-authentication-persistence-error";
import {PostgresStaffProvisioningRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-provisioning-repository";
import {staffAuthenticationPostgresSchema} from "@/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";

const now = new Date("2026-08-26T10:00:00.000Z");
let pool: Pool;
let repository: PostgresStaffProvisioningRepository;

function account(id: string, teamMemberId: string, email: string) {
  return StaffAccount.create({
    id,
    teamMemberId,
    normalizedEmail: email,
    passwordHash: "$yolpol-scrypt$v=1$ln=17,r=8,p=1$test-salt$test-hash",
    role: "ADMIN",
    createdAt: now,
  });
}

async function cleanProvisioningTables() {
  await pool.query("truncate table staff_sessions, staff_accounts, telegram_inquiry_deliveries, communication_recipients, inquiry_assignments, inquiry_team_members");
}

beforeAll(async () => {
  pool = createPostgresPool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: staffAuthenticationPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  repository = new PostgresStaffProvisioningRepository(pool);
});

beforeEach(async () => {
  const identity = await pool.query<{current_database: string; current_user: string}>("select current_database(), current_user");
  expect(identity.rows[0]).toEqual({current_database: "yolpol_integration", current_user: "yolpol_test"});
  await cleanProvisioningTables();
});

afterEach(cleanProvisioningTables);
afterAll(async () => { if (pool) await pool.end(); });

describe("PostgresStaffProvisioningRepository", () => {
  it("atomically creates the first Team Member and Staff Account", async () => {
    await expect(repository.provision({teamMember: {id: "member-1", displayName: "Admin One"}, account: account("staff_1", "member-1", "admin@example.test")}))
      .resolves.toEqual({status: "provisioned", teamMemberCreated: true});
    await expect(pool.query("select id, display_name, active from inquiry_team_members")).resolves.toMatchObject({rows: [{id: "member-1", display_name: "Admin One", active: true}]});
    await expect(pool.query("select id, team_member_id, normalized_email from staff_accounts")).resolves.toMatchObject({rows: [{id: "staff_1", team_member_id: "member-1", normalized_email: "admin@example.test"}]});
  });

  it("links an existing active Team Member without modifying its display name or timestamps", async () => {
    const existingCreatedAt = new Date("2026-01-01T00:00:00.000Z");
    await pool.query("insert into inquiry_team_members (id, display_name, active, created_at, updated_at) values ($1,$2,true,$3,$3)", ["member-1", "Existing Name", existingCreatedAt]);
    await expect(repository.provision({teamMember: {id: "member-1", displayName: "Existing Name"}, account: account("staff_1", "member-1", "admin@example.test")}))
      .resolves.toEqual({status: "provisioned", teamMemberCreated: false});
    await expect(pool.query("select display_name, created_at, updated_at from inquiry_team_members where id = 'member-1'"))
      .resolves.toMatchObject({rows: [{display_name: "Existing Name", created_at: existingCreatedAt, updated_at: existingCreatedAt}]});
  });

  it("returns safe inactive, display, already-provisioned, and email conflicts without overwriting", async () => {
    await pool.query("insert into inquiry_team_members (id, display_name, active, created_at, updated_at) values ('inactive','Inactive',false,$1,$1),('display-conflict','Stored Name',true,$1,$1),('existing','Existing',true,$1,$1),('email-owner','Email Owner',true,$1,$1)", [now]);
    await pool.query("insert into staff_accounts (id,team_member_id,normalized_email,password_hash,role,active,created_at,updated_at) values ('staff_existing','existing','existing@example.test','hash','SALES',true,$1,$1),('staff_email','email-owner','owned@example.test','hash','SALES',true,$1,$1)", [now]);

    await expect(repository.provision({teamMember: {id: "inactive", displayName: "Inactive"}, account: account("staff_1", "inactive", "inactive@example.test")})).resolves.toEqual({status: "inactive_team_member"});
    await expect(repository.provision({teamMember: {id: "display-conflict", displayName: "Changed"}, account: account("staff_2", "display-conflict", "changed@example.test")})).resolves.toEqual({status: "team_member_conflict"});
    await expect(repository.provision({teamMember: {id: "existing", displayName: "Existing"}, account: account("staff_3", "existing", "other@example.test")})).resolves.toEqual({status: "already_provisioned"});
    await expect(repository.provision({teamMember: {id: "new-member", displayName: "New Member"}, account: account("staff_4", "new-member", "owned@example.test")})).resolves.toEqual({status: "email_conflict"});
    expect((await pool.query("select id from inquiry_team_members where id = 'new-member'")).rowCount).toBe(0);
    expect((await pool.query("select display_name from inquiry_team_members where id = 'existing'")).rows).toEqual([{display_name: "Existing"}]);
  });

  it("rolls back a newly created Team Member when the Staff Account insert fails", async () => {
    await pool.query("alter table staff_accounts add constraint integration_reject_staff_account check (id <> 'staff_rejected')");
    try {
      await expect(repository.provision({teamMember: {id: "rollback-member", displayName: "Rollback"}, account: account("staff_rejected", "rollback-member", "rollback@example.test")}))
        .rejects.toEqual(new StaffAuthenticationPersistenceError());
      expect((await pool.query("select id from inquiry_team_members where id = 'rollback-member'")).rowCount).toBe(0);
    } finally {
      await pool.query("alter table staff_accounts drop constraint integration_reject_staff_account");
    }
  });

  it("turns concurrent duplicate email and Team Member races into non-destructive conflicts", async () => {
    const emailRace = await Promise.all([
      repository.provision({teamMember: {id: "member-a", displayName: "Member A"}, account: account("staff_a", "member-a", "shared@example.test")}),
      repository.provision({teamMember: {id: "member-b", displayName: "Member B"}, account: account("staff_b", "member-b", "shared@example.test")}),
    ]);
    expect(emailRace.filter((result) => result.status === "provisioned")).toHaveLength(1);
    expect(emailRace.filter((result) => result.status === "email_conflict")).toHaveLength(1);
    expect((await pool.query("select id from inquiry_team_members")).rowCount).toBe(1);

    await cleanProvisioningTables();
    const teamRace = await Promise.all([
      repository.provision({teamMember: {id: "member-same", displayName: "Same Member"}, account: account("staff_c", "member-same", "first@example.test")}),
      repository.provision({teamMember: {id: "member-same", displayName: "Same Member"}, account: account("staff_d", "member-same", "second@example.test")}),
    ]);
    expect(teamRace.filter((result) => result.status === "provisioned")).toHaveLength(1);
    expect(teamRace.filter((result) => result.status === "already_provisioned")).toHaveLength(1);
    expect((await pool.query("select id from staff_accounts where team_member_id = 'member-same'")).rowCount).toBe(1);
  });
});
