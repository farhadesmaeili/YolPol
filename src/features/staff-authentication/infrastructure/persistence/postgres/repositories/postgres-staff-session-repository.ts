import {and, eq, isNull} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {StaffSessionRepository} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {StaffSession} from "@/features/staff-authentication/domain/entities/staff-session";
import {parseStaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAuthenticationPersistenceError} from "@/features/staff-authentication/infrastructure/errors/staff-authentication-persistence-error";
import {staffAccounts, staffAuthenticationPostgresSchema, staffSessions} from "@/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema";
import {inquiryTeamMembers} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type StaffAuthenticationDatabase = NodePgDatabase<typeof staffAuthenticationPostgresSchema>;

export class PostgresStaffSessionRepository implements StaffSessionRepository {
  private readonly database: StaffAuthenticationDatabase;

  constructor(pool: Pool) { this.database = drizzle(pool, {schema: staffAuthenticationPostgresSchema}); }

  async create(session: StaffSession): Promise<void> {
    try {
      await this.database.insert(staffSessions).values({
        id: session.id,
        staffAccountId: session.staffAccountId,
        tokenLookup: session.tokenLookup,
        tokenVerification: session.tokenVerification,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      });
    } catch {
      throw new StaffAuthenticationPersistenceError();
    }
  }

  async findByLookup(lookup: string) {
    try {
      const [row] = await this.database.select({
        sessionId: staffSessions.id,
        sessionStaffAccountId: staffSessions.staffAccountId,
        tokenLookup: staffSessions.tokenLookup,
        tokenVerification: staffSessions.tokenVerification,
        sessionCreatedAt: staffSessions.createdAt,
        expiresAt: staffSessions.expiresAt,
        revokedAt: staffSessions.revokedAt,
        staffAccountId: staffAccounts.id,
        teamMemberId: staffAccounts.teamMemberId,
        role: staffAccounts.role,
        staffAccountActive: staffAccounts.active,
        teamMemberActive: inquiryTeamMembers.active,
        teamMemberDisplayName: inquiryTeamMembers.displayName,
      })
        .from(staffSessions)
        .innerJoin(staffAccounts, eq(staffAccounts.id, staffSessions.staffAccountId))
        .innerJoin(inquiryTeamMembers, eq(inquiryTeamMembers.id, staffAccounts.teamMemberId))
        .where(eq(staffSessions.tokenLookup, lookup))
        .limit(1);
      if (!row) return null;
      return Object.freeze({
        session: StaffSession.reconstitute({
          id: row.sessionId,
          staffAccountId: row.sessionStaffAccountId,
          tokenLookup: row.tokenLookup,
          tokenVerification: row.tokenVerification,
          createdAt: row.sessionCreatedAt,
          expiresAt: row.expiresAt,
          ...(row.revokedAt ? {revokedAt: row.revokedAt} : {}),
        }),
        staffAccountId: row.staffAccountId,
        teamMemberId: row.teamMemberId,
        role: parseStaffRole(row.role),
        staffAccountActive: row.staffAccountActive,
        teamMemberActive: row.teamMemberActive,
        teamMemberDisplayName: row.teamMemberDisplayName,
      });
    } catch {
      throw new StaffAuthenticationPersistenceError();
    }
  }

  async revokeById(sessionId: string, revokedAt: Date): Promise<void> {
    try {
      await this.database.update(staffSessions).set({revokedAt}).where(and(eq(staffSessions.id, sessionId), isNull(staffSessions.revokedAt)));
    } catch {
      throw new StaffAuthenticationPersistenceError();
    }
  }
}
