import {and, asc, eq, isNull, lte, or, sql} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {InquiryOutbox, PendingInquiryEvent} from "@/features/inquiries/application/ports/inquiry-ports";
import {inquiryCreatedEventType} from "@/features/inquiries/domain/events/inquiry-created";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {inquiryOutbox, inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type InquiryDatabase = NodePgDatabase<typeof inquiryPostgresSchema>;
const leaseMilliseconds = 60_000;

export class PostgresInquiryOutbox implements InquiryOutbox {
  private readonly database: InquiryDatabase;
  constructor(pool: Pool) { this.database = drizzle(pool, {schema: inquiryPostgresSchema}); }

  async claimPending(limit: number, now: Date): Promise<readonly PendingInquiryEvent[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Outbox batch size must be between 1 and 100.");
    try {
      return await this.database.transaction(async (transaction) => {
        const candidates = await transaction.select({id: inquiryOutbox.id}).from(inquiryOutbox)
          .where(and(isNull(inquiryOutbox.processedAt), lte(inquiryOutbox.availableAt, now), or(isNull(inquiryOutbox.lockedUntil), lte(inquiryOutbox.lockedUntil, now))))
          .orderBy(asc(inquiryOutbox.occurredAt)).limit(limit).for("update", {skipLocked: true});
        if (candidates.length === 0) return [];
        const claimed: PendingInquiryEvent[] = [];
        for (const candidate of candidates) {
          const [row] = await transaction.update(inquiryOutbox).set({attempts: sql`${inquiryOutbox.attempts} + 1`, lockedUntil: new Date(now.getTime() + leaseMilliseconds)})
            .where(eq(inquiryOutbox.id, candidate.id)).returning();
          if (!row || row.eventType !== inquiryCreatedEventType || row.payload.inquiryId !== row.aggregateId) throw new InquiryPersistenceError();
          const occurredAt = new Date(row.payload.occurredAt);
          if (!Number.isFinite(occurredAt.getTime())) throw new InquiryPersistenceError();
          claimed.push(Object.freeze({event: Object.freeze({eventId: row.id, type: inquiryCreatedEventType, inquiryId: row.aggregateId, occurredAt}), attempts: row.attempts}));
        }
        return Object.freeze(claimed);
      });
    } catch (error) { if (error instanceof RangeError) throw error; throw new InquiryPersistenceError(); }
  }

  async markProcessed(eventId: string, processedAt: Date): Promise<void> {
    try { await this.database.update(inquiryOutbox).set({processedAt, lockedUntil: null}).where(and(eq(inquiryOutbox.id, eventId), isNull(inquiryOutbox.processedAt))); }
    catch { throw new InquiryPersistenceError(); }
  }

  async scheduleRetry(eventId: string, nextAttemptAt: Date): Promise<void> {
    try { await this.database.update(inquiryOutbox).set({availableAt: nextAttemptAt, lockedUntil: null}).where(and(eq(inquiryOutbox.id, eventId), isNull(inquiryOutbox.processedAt))); }
    catch { throw new InquiryPersistenceError(); }
  }
}
