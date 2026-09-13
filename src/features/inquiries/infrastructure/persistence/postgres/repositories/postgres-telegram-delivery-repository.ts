import {and, asc, eq, inArray, isNull, lte, or, sql} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {TelegramDeliveryRepository} from "@/features/inquiries/application/ports/communication-ports";
import type {ClaimedTelegramDelivery, TelegramDeliveryErrorCode, TelegramDeliveryStatus} from "@/features/inquiries/application/types/telegram-delivery";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {communicationRecipients, inquiryOutbox, inquiryPostgresSchema, telegramInquiryDeliveries} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

type InquiryDatabase = NodePgDatabase<typeof inquiryPostgresSchema>;
const deliveryLeaseMilliseconds = 60_000;

function validRecipientKind(value: string): "TEAM_GROUP" | "TEAM_MEMBER" {
  if (value !== "TEAM_GROUP" && value !== "TEAM_MEMBER") throw new InquiryPersistenceError();
  return value;
}

export class PostgresTelegramDeliveryRepository implements TelegramDeliveryRepository {
  private readonly database: InquiryDatabase;

  constructor(pool: Pool) { this.database = drizzle(pool, {schema: inquiryPostgresSchema}); }

  async snapshotRecipients(input: Readonly<{outboxEventId: string; conversationId: string; now: Date}>): Promise<number> {
    try {
      return await this.database.transaction(async (transaction) => {
        const [event] = await transaction.select({id: inquiryOutbox.id})
          .from(inquiryOutbox)
          .where(eq(inquiryOutbox.id, input.outboxEventId))
          .limit(1)
          .for("update");
        if (!event) throw new InquiryPersistenceError();

        const [existing] = await transaction.select({count: sql<number>`count(*)::int`})
          .from(telegramInquiryDeliveries)
          .where(eq(telegramInquiryDeliveries.outboxEventId, input.outboxEventId));
        if ((existing?.count ?? 0) > 0) return existing!.count;

        await transaction.execute(sql`
          insert into telegram_inquiry_deliveries (
            outbox_event_id, recipient_id, conversation_id,
            recipient_kind, recipient_external_id, status,
            attempts, available_at, created_at, updated_at
          )
          select ${input.outboxEventId}, ${communicationRecipients.id}, ${input.conversationId}, ${communicationRecipients.kind},
            ${communicationRecipients.externalId}, 'PENDING', 0, ${input.now}, ${input.now}, ${input.now}
          from ${communicationRecipients}
          where ${communicationRecipients.channel} = 'TELEGRAM'
            and ${communicationRecipients.authorized} = true
            and ${communicationRecipients.notificationsEnabled} = true
          on conflict (outbox_event_id, recipient_id) do nothing
        `);
        const [created] = await transaction.select({count: sql<number>`count(*)::int`})
          .from(telegramInquiryDeliveries)
          .where(eq(telegramInquiryDeliveries.outboxEventId, input.outboxEventId));
        return created?.count ?? 0;
      });
    } catch (error) {
      if (error instanceof InquiryPersistenceError) throw error;
      throw new InquiryPersistenceError();
    }
  }

  async claimDue(input: Readonly<{outboxEventId: string; limit: number; now: Date}>): Promise<readonly ClaimedTelegramDelivery[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new RangeError("Telegram delivery batch size must be between 1 and 100.");
    try {
      return await this.database.transaction(async (transaction) => {
        await transaction.update(telegramInquiryDeliveries).set({
          status: "UNKNOWN",
          lockedUntil: null,
          lastErrorCode: "WORKER_OUTCOME_UNKNOWN",
          updatedAt: input.now,
        }).where(and(
          eq(telegramInquiryDeliveries.outboxEventId, input.outboxEventId),
          eq(telegramInquiryDeliveries.status, "IN_FLIGHT"),
          lte(telegramInquiryDeliveries.lockedUntil, input.now),
        ));

        const candidates = await transaction.select({
          outboxEventId: telegramInquiryDeliveries.outboxEventId,
          recipientId: telegramInquiryDeliveries.recipientId,
        }).from(telegramInquiryDeliveries).where(and(
          eq(telegramInquiryDeliveries.outboxEventId, input.outboxEventId),
          inArray(telegramInquiryDeliveries.status, ["PENDING", "RETRYABLE_FAILURE"]),
          lte(telegramInquiryDeliveries.availableAt, input.now),
          or(isNull(telegramInquiryDeliveries.lockedUntil), lte(telegramInquiryDeliveries.lockedUntil, input.now)),
        )).orderBy(asc(telegramInquiryDeliveries.availableAt), asc(telegramInquiryDeliveries.recipientId))
          .limit(input.limit)
          .for("update", {skipLocked: true});

        const claimed: ClaimedTelegramDelivery[] = [];
        for (const candidate of candidates) {
          const [row] = await transaction.update(telegramInquiryDeliveries).set({
            status: "IN_FLIGHT",
            attempts: sql`${telegramInquiryDeliveries.attempts} + 1`,
            lockedUntil: new Date(input.now.getTime() + deliveryLeaseMilliseconds),
            updatedAt: input.now,
          }).where(and(
            eq(telegramInquiryDeliveries.outboxEventId, candidate.outboxEventId),
            eq(telegramInquiryDeliveries.recipientId, candidate.recipientId),
            inArray(telegramInquiryDeliveries.status, ["PENDING", "RETRYABLE_FAILURE"]),
          )).returning();
          if (!row) throw new InquiryPersistenceError();
          claimed.push(Object.freeze({
            outboxEventId: row.outboxEventId,
            recipientId: row.recipientId,
            conversationId: row.conversationId,
            recipientKind: validRecipientKind(row.recipientKind),
            recipientExternalId: row.recipientExternalId,
            attempts: row.attempts,
          }));
        }
        return Object.freeze(claimed);
      });
    } catch (error) {
      if (error instanceof RangeError) throw error;
      throw new InquiryPersistenceError();
    }
  }

  async markDelivered(input: Readonly<{delivery: ClaimedTelegramDelivery; telegramChatId: number; telegramMessageId: number; deliveredAt: Date}>): Promise<void> {
    await this.transition(input.delivery, {
      status: "DELIVERED",
      telegramChatId: input.telegramChatId,
      telegramMessageId: input.telegramMessageId,
      deliveredAt: input.deliveredAt,
      lockedUntil: null,
      lastErrorCode: null,
      updatedAt: input.deliveredAt,
    });
  }

  async markRetryable(input: Readonly<{delivery: ClaimedTelegramDelivery; errorCode: TelegramDeliveryErrorCode; availableAt: Date; updatedAt: Date}>): Promise<void> {
    await this.transition(input.delivery, {status: "RETRYABLE_FAILURE", availableAt: input.availableAt, lockedUntil: null, lastErrorCode: input.errorCode, updatedAt: input.updatedAt});
  }

  async markPermanentFailure(input: Readonly<{delivery: ClaimedTelegramDelivery; errorCode: TelegramDeliveryErrorCode; updatedAt: Date}>): Promise<void> {
    await this.transition(input.delivery, {status: "PERMANENT_FAILURE", lockedUntil: null, lastErrorCode: input.errorCode, updatedAt: input.updatedAt});
  }

  async markUnknown(input: Readonly<{delivery: ClaimedTelegramDelivery; errorCode: TelegramDeliveryErrorCode; updatedAt: Date}>): Promise<void> {
    await this.transition(input.delivery, {status: "UNKNOWN", lockedUntil: null, lastErrorCode: input.errorCode, updatedAt: input.updatedAt});
  }

  async summarizeEvent(outboxEventId: string) {
    try {
      const [row] = await this.database.select({
        total: sql<number>`count(*)::int`,
        automaticWorkRemaining: sql<number>`count(*) filter (where ${telegramInquiryDeliveries.status} in ('PENDING','IN_FLIGHT','RETRYABLE_FAILURE'))::int`,
        nextAutomaticWorkAt: sql<Date | null>`min(case when ${telegramInquiryDeliveries.status} in ('PENDING','RETRYABLE_FAILURE') then ${telegramInquiryDeliveries.availableAt} when ${telegramInquiryDeliveries.status} = 'IN_FLIGHT' then ${telegramInquiryDeliveries.lockedUntil} end)`.mapWith(telegramInquiryDeliveries.availableAt),
        delivered: sql<number>`count(*) filter (where ${telegramInquiryDeliveries.status} = 'DELIVERED')::int`,
        permanentFailures: sql<number>`count(*) filter (where ${telegramInquiryDeliveries.status} = 'PERMANENT_FAILURE')::int`,
        unknown: sql<number>`count(*) filter (where ${telegramInquiryDeliveries.status} = 'UNKNOWN')::int`,
      }).from(telegramInquiryDeliveries).where(eq(telegramInquiryDeliveries.outboxEventId, outboxEventId));
      return Object.freeze({
        total: row?.total ?? 0,
        automaticWorkRemaining: row?.automaticWorkRemaining ?? 0,
        nextAutomaticWorkAt: row?.nextAutomaticWorkAt ?? null,
        delivered: row?.delivered ?? 0,
        permanentFailures: row?.permanentFailures ?? 0,
        unknown: row?.unknown ?? 0,
      });
    } catch { throw new InquiryPersistenceError(); }
  }

  async findConversationByProviderMessage(input: Readonly<{telegramChatId: number; telegramMessageId: number}>): Promise<Readonly<{conversationId: string}> | null> {
    try {
      const [row] = await this.database.select({conversationId: telegramInquiryDeliveries.conversationId})
        .from(telegramInquiryDeliveries)
        .where(and(
          eq(telegramInquiryDeliveries.telegramChatId, input.telegramChatId),
          eq(telegramInquiryDeliveries.telegramMessageId, input.telegramMessageId),
          eq(telegramInquiryDeliveries.status, "DELIVERED"),
        )).limit(1);
      return row ? Object.freeze(row) : null;
    } catch { throw new InquiryPersistenceError(); }
  }

  private async transition(delivery: ClaimedTelegramDelivery, values: Partial<typeof telegramInquiryDeliveries.$inferInsert> & Readonly<{status: TelegramDeliveryStatus; updatedAt: Date}>): Promise<void> {
    try {
      const rows = await this.database.update(telegramInquiryDeliveries).set(values).where(and(
        eq(telegramInquiryDeliveries.outboxEventId, delivery.outboxEventId),
        eq(telegramInquiryDeliveries.recipientId, delivery.recipientId),
        eq(telegramInquiryDeliveries.status, "IN_FLIGHT"),
        eq(telegramInquiryDeliveries.attempts, delivery.attempts),
      )).returning({recipientId: telegramInquiryDeliveries.recipientId});
      if (rows.length !== 1) throw new InquiryPersistenceError();
    } catch (error) {
      if (error instanceof InquiryPersistenceError) throw error;
      throw new InquiryPersistenceError();
    }
  }
}
