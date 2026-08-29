import {eq} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {StaffAccountRepository} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {StaffAccount} from "@/features/staff-authentication/domain/entities/staff-account";
import {parseStaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAuthenticationPersistenceError} from "@/features/staff-authentication/infrastructure/errors/staff-authentication-persistence-error";
import {staffAccounts, staffAuthenticationPostgresSchema} from "@/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema";
import {inquiryTeamMembers} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type StaffAuthenticationDatabase = NodePgDatabase<typeof staffAuthenticationPostgresSchema>;

export class PostgresStaffAccountRepository implements StaffAccountRepository {
  private readonly database: StaffAuthenticationDatabase;

  constructor(pool: Pool) { this.database = drizzle(pool, {schema: staffAuthenticationPostgresSchema}); }

  async findByNormalizedEmail(normalizedEmail: string) {
    try {
      const [row] = await this.database.select({
        id: staffAccounts.id,
        teamMemberId: staffAccounts.teamMemberId,
        normalizedEmail: staffAccounts.normalizedEmail,
        passwordHash: staffAccounts.passwordHash,
        role: staffAccounts.role,
        active: staffAccounts.active,
        createdAt: staffAccounts.createdAt,
        updatedAt: staffAccounts.updatedAt,
        teamMemberActive: inquiryTeamMembers.active,
        teamMemberDisplayName: inquiryTeamMembers.displayName,
      })
        .from(staffAccounts)
        .innerJoin(inquiryTeamMembers, eq(inquiryTeamMembers.id, staffAccounts.teamMemberId))
        .where(eq(staffAccounts.normalizedEmail, normalizedEmail))
        .limit(1);
      if (!row) return null;
      return Object.freeze({
        account: StaffAccount.reconstitute(row),
        teamMemberActive: row.teamMemberActive,
        teamMemberDisplayName: row.teamMemberDisplayName,
      });
    } catch {
      throw new StaffAuthenticationPersistenceError();
    }
  }

  async findAuthorizationByTeamMemberId(teamMemberId: string) {
    try {
      const [row] = await this.database.select({
        staffAccountId: staffAccounts.id,
        teamMemberId: staffAccounts.teamMemberId,
        role: staffAccounts.role,
        staffAccountActive: staffAccounts.active,
        teamMemberActive: inquiryTeamMembers.active,
        teamMemberDisplayName: inquiryTeamMembers.displayName,
      })
        .from(staffAccounts)
        .innerJoin(inquiryTeamMembers, eq(inquiryTeamMembers.id, staffAccounts.teamMemberId))
        .where(eq(staffAccounts.teamMemberId, teamMemberId))
        .limit(1);
      if (!row) return null;
      return Object.freeze({...row, role: parseStaffRole(row.role)});
    } catch {
      throw new StaffAuthenticationPersistenceError();
    }
  }
}
