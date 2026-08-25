import {and, asc, eq} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {InquiryAssignmentSnapshot, InquiryStatusSnapshot, InquiryWorkflowRepository, WorkflowWriteResult} from "@/features/inquiries/application/ports/inquiry-workflow-ports";
import type {Inquiry} from "@/features/inquiries/domain/entities/inquiry";
import {InquiryAssignment} from "@/features/inquiries/domain/entities/inquiry-assignment";
import {TeamMember} from "@/features/inquiries/domain/entities/team-member";
import type {InquiryWorkflowEvent, InquiryWorkflowEventType, StoredInquiryWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {inquiries, inquiryAssignments, inquiryPostgresSchema, inquiryTeamMembers, inquiryWorkflowEvents} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type InquiryDatabase = NodePgDatabase<typeof inquiryPostgresSchema>;

const eventValues = (event: InquiryWorkflowEvent) => ({
  inquiryId: event.inquiryId,
  eventType: event.type,
  previousValue: event.previousValue,
  newValue: event.newValue,
  actorReference: event.actorReference,
  occurredAt: new Date(event.occurredAt),
});

export class PostgresInquiryWorkflowRepository implements InquiryWorkflowRepository {
  private readonly database: InquiryDatabase;

  constructor(pool: Pool) { this.database = drizzle(pool, {schema: inquiryPostgresSchema}); }

  async findAssignment(inquiryId: string): Promise<InquiryAssignment> {
    try {
      const [row] = await this.database.select().from(inquiryAssignments).where(eq(inquiryAssignments.inquiryId, inquiryId)).limit(1);
      return row ? InquiryAssignment.reconstitute(row.inquiryId, row.teamMemberId, row.assignedAt) : InquiryAssignment.unassigned(inquiryId);
    } catch { throw new InquiryPersistenceError(); }
  }

  async findTeamMember(id: string): Promise<TeamMember | null> {
    try {
      const [row] = await this.database.select({id: inquiryTeamMembers.id, active: inquiryTeamMembers.active}).from(inquiryTeamMembers).where(eq(inquiryTeamMembers.id, id)).limit(1);
      return row ? TeamMember.reconstitute(row.id, row.active) : null;
    } catch { throw new InquiryPersistenceError(); }
  }

  async changeStatus(inquiry: Inquiry, expected: InquiryStatusSnapshot, event: InquiryWorkflowEvent): Promise<WorkflowWriteResult> {
    const updatedAt = inquiry.updatedAt;
    if (!(expected.updatedAt instanceof Date) || !Number.isFinite(expected.updatedAt.getTime()) || updatedAt.getTime() <= expected.updatedAt.getTime() || event.inquiryId !== inquiry.id.value || event.previousValue !== expected.status || event.newValue !== inquiry.status || event.type !== "STATUS_CHANGED") throw new InquiryPersistenceError();
    try {
      return await this.database.transaction(async (transaction) => {
        const updated = await transaction.update(inquiries).set({status: inquiry.status, updatedAt}).where(and(eq(inquiries.id, inquiry.id.value), eq(inquiries.status, expected.status), eq(inquiries.updatedAt, expected.updatedAt))).returning({id: inquiries.id});
        if (updated.length !== 1) return "conflict";
        await transaction.insert(inquiryWorkflowEvents).values(eventValues(event));
        return "changed";
      });
    } catch { throw new InquiryPersistenceError(); }
  }

  async changeAssignment(assignment: InquiryAssignment, expected: InquiryAssignmentSnapshot, event: InquiryWorkflowEvent): Promise<WorkflowWriteResult> {
    const changedAt = assignment.changedAt;
    const expectedChangedAt = expected.changedAt;
    const expectedTimestampValid = expectedChangedAt === null || (expectedChangedAt instanceof Date && Number.isFinite(expectedChangedAt.getTime()));
    const snapshotShapeValid = (expected.teamMemberId === null) === (expectedChangedAt === null);
    if (!expectedTimestampValid || !snapshotShapeValid || (expectedChangedAt !== null && changedAt !== null && changedAt.getTime() <= expectedChangedAt.getTime()) || event.inquiryId !== assignment.inquiryId.value || event.previousValue !== expected.teamMemberId || event.newValue !== assignment.teamMemberId || changedAt === null) throw new InquiryPersistenceError();
    try {
      return await this.database.transaction(async (transaction) => {
        if (assignment.teamMemberId !== null) {
          const [member] = await transaction.select({active: inquiryTeamMembers.active}).from(inquiryTeamMembers).where(eq(inquiryTeamMembers.id, assignment.teamMemberId)).limit(1).for("update");
          if (!member?.active) return "member_inactive";
        }

        let changed: readonly {inquiryId: string}[];
        if (expected.teamMemberId === null) {
          if (assignment.teamMemberId === null) return "conflict";
          changed = await transaction.insert(inquiryAssignments).values({inquiryId: assignment.inquiryId.value, teamMemberId: assignment.teamMemberId, assignedAt: changedAt}).onConflictDoNothing().returning({inquiryId: inquiryAssignments.inquiryId});
        } else if (assignment.teamMemberId === null) {
          if (expectedChangedAt === null) throw new InquiryPersistenceError();
          changed = await transaction.delete(inquiryAssignments).where(and(eq(inquiryAssignments.inquiryId, assignment.inquiryId.value), eq(inquiryAssignments.teamMemberId, expected.teamMemberId), eq(inquiryAssignments.assignedAt, expectedChangedAt))).returning({inquiryId: inquiryAssignments.inquiryId});
        } else {
          if (expectedChangedAt === null) throw new InquiryPersistenceError();
          changed = await transaction.update(inquiryAssignments).set({teamMemberId: assignment.teamMemberId, assignedAt: changedAt}).where(and(eq(inquiryAssignments.inquiryId, assignment.inquiryId.value), eq(inquiryAssignments.teamMemberId, expected.teamMemberId), eq(inquiryAssignments.assignedAt, expectedChangedAt))).returning({inquiryId: inquiryAssignments.inquiryId});
        }
        if (changed.length !== 1) return "conflict";
        await transaction.insert(inquiryWorkflowEvents).values(eventValues(event));
        return "changed";
      });
    } catch { throw new InquiryPersistenceError(); }
  }

  async readHistory(inquiryId: string): Promise<readonly StoredInquiryWorkflowEvent[]> {
    try {
      const rows = await this.database.select().from(inquiryWorkflowEvents).where(eq(inquiryWorkflowEvents.inquiryId, inquiryId)).orderBy(asc(inquiryWorkflowEvents.occurredAt), asc(inquiryWorkflowEvents.id));
      return Object.freeze(rows.map((row) => Object.freeze({
        id: row.id.toString(),
        inquiryId: row.inquiryId,
        type: row.eventType as InquiryWorkflowEventType,
        previousValue: row.previousValue,
        newValue: row.newValue,
        actorReference: row.actorReference,
        occurredAt: row.occurredAt.toISOString(),
      })));
    } catch { throw new InquiryPersistenceError(); }
  }
}
