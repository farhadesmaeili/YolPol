import {eq} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {StaffProvisioningPersistenceResult, StaffProvisioningRepository} from "@/features/staff-authentication/application/ports/staff-provisioning-ports";
import {StaffAuthenticationPersistenceError} from "@/features/staff-authentication/infrastructure/errors/staff-authentication-persistence-error";
import {staffAccounts, staffAuthenticationPostgresSchema} from "@/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema";
import {inquiryTeamMembers} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type StaffProvisioningDatabase = NodePgDatabase<typeof staffAuthenticationPostgresSchema>;
type ConflictStatus = Exclude<StaffProvisioningPersistenceResult["status"], "provisioned">;

class StaffProvisioningConflict extends Error {
  constructor(readonly status: ConflictStatus) {
    super("Staff provisioning conflict.");
    this.name = "StaffProvisioningConflict";
  }
}

type PostgresErrorShape = Readonly<{code?: unknown; constraint?: unknown; cause?: unknown}>;

function postgresUniqueConflict(error: unknown, depth = 0): ConflictStatus | null {
  if (depth > 3 || typeof error !== "object" || error === null) return null;
  const candidate = error as PostgresErrorShape;
  if (candidate.code === "23505" && typeof candidate.constraint === "string") {
    if (candidate.constraint === "staff_accounts_team_member_uidx") return "already_provisioned";
    if (candidate.constraint === "staff_accounts_normalized_email_uidx") return "email_conflict";
    if (candidate.constraint === "inquiry_team_members_pkey") return "team_member_conflict";
  }
  return postgresUniqueConflict(candidate.cause, depth + 1);
}

export class PostgresStaffProvisioningRepository implements StaffProvisioningRepository {
  private readonly database: StaffProvisioningDatabase;

  constructor(pool: Pool) {
    this.database = drizzle(pool, {schema: staffAuthenticationPostgresSchema});
  }

  async provision(input: Parameters<StaffProvisioningRepository["provision"]>[0]): Promise<StaffProvisioningPersistenceResult> {
    try {
      return await this.database.transaction(async (transaction) => {
        const now = input.account.createdAt;
        const insertedTeamMembers = await transaction.insert(inquiryTeamMembers).values({
          id: input.teamMember.id,
          displayName: input.teamMember.displayName,
          active: true,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing({target: inquiryTeamMembers.id}).returning({id: inquiryTeamMembers.id});

        const [teamMember] = await transaction.select({
          displayName: inquiryTeamMembers.displayName,
          active: inquiryTeamMembers.active,
        }).from(inquiryTeamMembers)
          .where(eq(inquiryTeamMembers.id, input.teamMember.id))
          .for("update")
          .limit(1);

        if (!teamMember) throw new StaffAuthenticationPersistenceError();
        if (!teamMember.active) throw new StaffProvisioningConflict("inactive_team_member");

        const [linkedAccount] = await transaction.select({id: staffAccounts.id}).from(staffAccounts)
          .where(eq(staffAccounts.teamMemberId, input.teamMember.id))
          .limit(1);
        if (linkedAccount) throw new StaffProvisioningConflict("already_provisioned");
        if (teamMember.displayName !== input.teamMember.displayName) throw new StaffProvisioningConflict("team_member_conflict");

        const [emailAccount] = await transaction.select({id: staffAccounts.id}).from(staffAccounts)
          .where(eq(staffAccounts.normalizedEmail, input.account.normalizedEmail))
          .limit(1);
        if (emailAccount) throw new StaffProvisioningConflict("email_conflict");

        await transaction.insert(staffAccounts).values({
          id: input.account.id,
          teamMemberId: input.account.teamMemberId,
          normalizedEmail: input.account.normalizedEmail,
          passwordHash: input.account.passwordHash,
          role: input.account.role,
          active: input.account.active,
          createdAt: input.account.createdAt,
          updatedAt: input.account.updatedAt,
        });

        return {status: "provisioned", teamMemberCreated: insertedTeamMembers.length === 1};
      });
    } catch (error) {
      if (error instanceof StaffProvisioningConflict) return {status: error.status};
      const uniqueConflict = postgresUniqueConflict(error);
      if (uniqueConflict) return {status: uniqueConflict};
      throw new StaffAuthenticationPersistenceError();
    }
  }
}
