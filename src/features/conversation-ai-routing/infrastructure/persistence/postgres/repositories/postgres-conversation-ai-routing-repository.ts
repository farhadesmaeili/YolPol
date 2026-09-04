import {and, asc, desc, eq, gt, inArray, lte, max, sql} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {AiOperationsAvailabilityEvaluator, ConversationAiLeaseTokenGenerator, ConversationAiRoutingRepository} from "@/features/conversation-ai-routing/application/ports/conversation-ai-routing-ports";
import {conversationAiMessageId} from "@/features/conversation-ai-routing/domain/services/conversation-ai-identities";
import {conversationAiControlStates, conversationAiJobStatuses, type ClaimedConversationAiJob, type ConversationAiContextMessage, type ConversationAiControlState, type ConversationAiFailureCategory} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";
import {conversationAiControlEvents, conversationAiControls, conversationAiResponseJobs, conversationAiRoutingPostgresSchema} from "@/features/conversation-ai-routing/infrastructure/persistence/postgres/schema/conversation-ai-routing-schema";
import {aiOperationPolicy, aiOperationsPostgresSchema} from "@/features/ai-operations/infrastructure/persistence/postgres/schema/ai-operations-schema";
import {Message} from "@/features/inquiries/domain/entities/message";
import {conversationMessages, conversations, inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

const schema = {...inquiryPostgresSchema, ...conversationAiRoutingPostgresSchema, ...aiOperationsPostgresSchema};
type RoutingDatabase = NodePgDatabase<typeof schema>;
const maximumClaims = 3;

function validDate(value: Date): boolean { return value instanceof Date && Number.isFinite(value.getTime()); }
function controlState(value: string): ConversationAiControlState {
  if (!(conversationAiControlStates as readonly string[]).includes(value)) throw new Error("Invalid Conversation AI control state.");
  return value as ConversationAiControlState;
}
function jobStatus(value: string) {
  if (!(conversationAiJobStatuses as readonly string[]).includes(value)) throw new Error("Invalid Conversation AI job status.");
  return value as (typeof conversationAiJobStatuses)[number];
}

export class PostgresConversationAiRoutingRepository implements ConversationAiRoutingRepository {
  private readonly database: RoutingDatabase;

  constructor(
    pool: Pool,
    private readonly leaseTokens: ConversationAiLeaseTokenGenerator,
    private readonly finalOperations: AiOperationsAvailabilityEvaluator,
  ) { this.database = drizzle(pool, {schema}); }

  async claimDue(input: Readonly<{limit: number; now: Date; leaseMilliseconds: number}>): Promise<readonly ClaimedConversationAiJob[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100 || !validDate(input.now)
      || !Number.isSafeInteger(input.leaseMilliseconds) || input.leaseMilliseconds < 10_000 || input.leaseMilliseconds > 300_000) {
      throw new RangeError("Conversation AI claim input is invalid.");
    }
    return this.database.transaction(async (transaction) => {
      await transaction.update(conversationAiResponseJobs).set({
        status: "FAILED", leaseToken: null, leasedUntil: null, failureCategory: "WORKER_RECOVERY_EXHAUSTED",
        terminalAt: input.now, updatedAt: input.now, version: sql`${conversationAiResponseJobs.version} + 1`,
      }).where(and(eq(conversationAiResponseJobs.status, "RUNNING"), lte(conversationAiResponseJobs.leasedUntil, input.now), sql`${conversationAiResponseJobs.attempts} >= ${maximumClaims}`));
      await transaction.update(conversationAiResponseJobs).set({
        status: "PENDING", leaseToken: null, leasedUntil: null, updatedAt: input.now,
        version: sql`${conversationAiResponseJobs.version} + 1`,
      }).where(and(eq(conversationAiResponseJobs.status, "RUNNING"), lte(conversationAiResponseJobs.leasedUntil, input.now), sql`${conversationAiResponseJobs.attempts} < ${maximumClaims}`));

      const candidates = await transaction.select({id: conversationAiResponseJobs.id})
        .from(conversationAiResponseJobs)
        .where(and(eq(conversationAiResponseJobs.status, "PENDING"), lte(conversationAiResponseJobs.notBefore, input.now)))
        .orderBy(asc(conversationAiResponseJobs.notBefore), asc(conversationAiResponseJobs.id))
        .limit(input.limit)
        .for("update", {skipLocked: true});
      const claimed: ClaimedConversationAiJob[] = [];
      for (const candidate of candidates) {
        const leaseToken = this.leaseTokens.generate();
        const leasedUntil = new Date(input.now.getTime() + input.leaseMilliseconds);
        const [row] = await transaction.update(conversationAiResponseJobs).set({
          status: "RUNNING", attempts: sql`${conversationAiResponseJobs.attempts} + 1`, leaseToken, leasedUntil,
          updatedAt: input.now, version: sql`${conversationAiResponseJobs.version} + 1`,
        }).where(and(eq(conversationAiResponseJobs.id, candidate.id), eq(conversationAiResponseJobs.status, "PENDING")))
          .returning();
        if (!row) continue;
        claimed.push(Object.freeze({
          id: row.id, conversationId: row.conversationId, triggerMessageId: row.triggerMessageId,
          triggerMessagePosition: row.triggerMessagePosition, executionId: row.executionId,
          leaseToken, leasedUntil, attempts: row.attempts, createdAt: new Date(row.createdAt),
        }));
      }
      return Object.freeze(claimed);
    });
  }

  async prepare(input: Readonly<{job: ClaimedConversationAiJob; now: Date; maximumAgeMilliseconds: number}>) {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({id: conversations.id}).from(conversations)
        .where(eq(conversations.id, input.job.conversationId)).limit(1).for("update");
      if (!conversation) return {status: "cancelled" as const};
      const [job] = await transaction.select().from(conversationAiResponseJobs)
        .where(eq(conversationAiResponseJobs.id, input.job.id)).limit(1).for("update");
      if (!job || job.status !== "RUNNING" || job.leaseToken !== input.job.leaseToken || !job.leasedUntil || job.leasedUntil <= input.now) return {status: "stale_lease" as const};
      if (input.now.getTime() - job.createdAt.getTime() > input.maximumAgeMilliseconds) {
        await this.terminalize(transaction, input.job, "CANCELLED", input.now);
        return {status: "cancelled" as const};
      }
      if (!await this.triggerExists(transaction, job.conversationId, job.triggerMessageId, job.triggerMessagePosition)) {
        await this.terminalize(transaction, input.job, "CANCELLED", input.now);
        return {status: "cancelled" as const};
      }
      const blocked = await this.blockingState(transaction, job.conversationId, job.triggerMessagePosition);
      if (blocked) {
        await this.terminalize(transaction, input.job, blocked, input.now);
        return {status: blocked === "SUPERSEDED" ? "superseded" as const : "cancelled" as const};
      }
      const rows = await transaction.select().from(conversationMessages)
        .where(eq(conversationMessages.conversationId, job.conversationId))
        .orderBy(desc(conversationMessages.position)).limit(40);
      const messages: ConversationAiContextMessage[] = rows.reverse().map((row) => Object.freeze({
        id: row.id, position: row.position, senderType: row.senderType as ConversationAiContextMessage["senderType"],
        channel: row.channel as ConversationAiContextMessage["channel"], body: row.body, createdAt: new Date(row.createdAt),
      }));
      return {status: "eligible" as const, messages: Object.freeze(messages)};
    });
  }

  async cancel(input: Readonly<{job: ClaimedConversationAiJob; now: Date}>): Promise<void> {
    await this.database.transaction(async (transaction) => { await this.terminalize(transaction, input.job, "CANCELLED", input.now); });
  }

  async fail(input: Readonly<{job: ClaimedConversationAiJob; category: ConversationAiFailureCategory; now: Date}>): Promise<void> {
    await this.database.update(conversationAiResponseJobs).set({
      status: "FAILED", leaseToken: null, leasedUntil: null, failureCategory: input.category,
      terminalAt: input.now, updatedAt: input.now, version: sql`${conversationAiResponseJobs.version} + 1`,
    }).where(and(eq(conversationAiResponseJobs.id, input.job.id), eq(conversationAiResponseJobs.status, "RUNNING"), eq(conversationAiResponseJobs.leaseToken, input.job.leaseToken)));
  }

  async finalize(input: Readonly<{job: ClaimedConversationAiJob; body: string; now: Date}>) {
    const message = Message.create({id: conversationAiMessageId(input.job.id), senderType: "AI_AGENT", channel: "WEBSITE", body: input.body, createdAt: input.now});
    return this.database.transaction(async (transaction) => {
      await transaction.select({id: aiOperationPolicy.id}).from(aiOperationPolicy).where(eq(aiOperationPolicy.id, "global")).limit(1).for("share");
      const [conversation] = await transaction.select({id: conversations.id}).from(conversations)
        .where(eq(conversations.id, input.job.conversationId)).limit(1).for("update");
      if (!conversation) return "cancelled" as const;
      const [job] = await transaction.select().from(conversationAiResponseJobs)
        .where(eq(conversationAiResponseJobs.id, input.job.id)).limit(1).for("update");
      if (!job || job.status !== "RUNNING" || job.leaseToken !== input.job.leaseToken || !job.leasedUntil || job.leasedUntil <= input.now) return "stale_lease" as const;
      if (!await this.triggerExists(transaction, job.conversationId, job.triggerMessageId, job.triggerMessagePosition)) {
        await this.terminalize(transaction, input.job, "CANCELLED", input.now);
        return "cancelled" as const;
      }
      const blocked = await this.blockingState(transaction, job.conversationId, job.triggerMessagePosition);
      if (blocked) {
        await this.terminalize(transaction, input.job, blocked, input.now);
        return blocked === "SUPERSEDED" ? "superseded" as const : "cancelled" as const;
      }
      let globalAllowed = false;
      try { globalAllowed = (await this.finalOperations.execute()).allowed; } catch { globalAllowed = false; }
      if (!globalAllowed) {
        await this.terminalize(transaction, input.job, "CANCELLED", input.now);
        return "cancelled" as const;
      }

      const [latest] = await transaction.select({position: max(conversationMessages.position)}).from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversation.id));
      const inserted = await transaction.insert(conversationMessages).values({
        id: message.id.value, conversationId: conversation.id, position: (latest?.position ?? -1) + 1,
        senderType: "AI_AGENT", channel: "WEBSITE", actorReference: null, body: message.body, createdAt: message.createdAt,
      }).onConflictDoNothing({target: conversationMessages.id}).returning({id: conversationMessages.id});
      if (inserted.length !== 1) {
        const [existing] = await transaction.select({id: conversationMessages.id}).from(conversationMessages)
          .where(and(eq(conversationMessages.id, message.id.value), eq(conversationMessages.conversationId, conversation.id), eq(conversationMessages.senderType, "AI_AGENT"), eq(conversationMessages.channel, "WEBSITE"))).limit(1);
        if (!existing) throw new Error("Conversation AI message identity conflict.");
      }
      const updated = await transaction.update(conversationAiResponseJobs).set({
        status: "SUCCEEDED", leaseToken: null, leasedUntil: null, terminalAt: input.now, updatedAt: input.now,
        version: sql`${conversationAiResponseJobs.version} + 1`,
      }).where(and(eq(conversationAiResponseJobs.id, input.job.id), eq(conversationAiResponseJobs.status, "RUNNING"), eq(conversationAiResponseJobs.leaseToken, input.job.leaseToken)))
        .returning({id: conversationAiResponseJobs.id});
      if (updated.length !== 1) throw new Error("Conversation AI finalization lost its lease.");
      return "succeeded" as const;
    });
  }

  async readStatus(inquiryId: string) {
    const [conversation] = await this.database.select({id: conversations.id}).from(conversations).where(eq(conversations.inquiryId, inquiryId)).limit(1);
    if (!conversation) return null;
    const [control] = await this.database.select().from(conversationAiControls).where(eq(conversationAiControls.conversationId, conversation.id)).limit(1);
    const [job] = await this.database.select({status: conversationAiResponseJobs.status, notBefore: conversationAiResponseJobs.notBefore, updatedAt: conversationAiResponseJobs.updatedAt})
      .from(conversationAiResponseJobs).where(eq(conversationAiResponseJobs.conversationId, conversation.id))
      .orderBy(desc(conversationAiResponseJobs.createdAt), desc(conversationAiResponseJobs.id)).limit(1);
    return Object.freeze({
      state: control ? controlState(control.state) : "AUTO",
      version: control?.version ?? 0,
      latestJob: job ? Object.freeze({status: jobStatus(job.status), notBefore: job.notBefore.toISOString(), updatedAt: job.updatedAt.toISOString()}) : null,
    });
  }

  async changeControl(input: Readonly<{inquiryId: string; state: ConversationAiControlState; expectedVersion: number; actorReference: string; eventId: string; now: Date}>) {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction.select({id: conversations.id}).from(conversations)
        .where(eq(conversations.inquiryId, input.inquiryId)).limit(1).for("update");
      if (!conversation) return "not_found" as const;
      const [current] = await transaction.select().from(conversationAiControls)
        .where(eq(conversationAiControls.conversationId, conversation.id)).limit(1).for("update");
      const previousState = current ? controlState(current.state) : "AUTO";
      const previousVersion = current?.version ?? 0;
      if (input.expectedVersion !== previousVersion) return "conflict" as const;
      if (input.state === previousState) return "unchanged" as const;
      const newVersion = previousVersion + 1;
      if (current) {
        await transaction.update(conversationAiControls).set({state: input.state, version: newVersion, updatedAt: input.now, updatedBy: input.actorReference})
          .where(and(eq(conversationAiControls.conversationId, conversation.id), eq(conversationAiControls.version, previousVersion)));
      } else {
        await transaction.insert(conversationAiControls).values({conversationId: conversation.id, state: input.state, version: newVersion, updatedAt: input.now, updatedBy: input.actorReference});
      }
      await transaction.insert(conversationAiControlEvents).values({
        id: input.eventId, conversationId: conversation.id, previousState, newState: input.state,
        previousVersion, newVersion, actorReference: input.actorReference, occurredAt: input.now,
      });
      if (input.state !== "AUTO") await transaction.update(conversationAiResponseJobs).set({
        status: "CANCELLED", leaseToken: null, leasedUntil: null, terminalAt: input.now, updatedAt: input.now,
        version: sql`${conversationAiResponseJobs.version} + 1`,
      }).where(and(eq(conversationAiResponseJobs.conversationId, conversation.id), inArray(conversationAiResponseJobs.status, ["PENDING", "RUNNING"])));
      return "updated" as const;
    });
  }

  private async blockingState(transaction: Parameters<Parameters<RoutingDatabase["transaction"]>[0]>[0], conversationId: string, triggerPosition: number): Promise<"CANCELLED" | "SUPERSEDED" | null> {
    const [control] = await transaction.select({state: conversationAiControls.state}).from(conversationAiControls)
      .where(eq(conversationAiControls.conversationId, conversationId)).limit(1);
    if (control && controlState(control.state) !== "AUTO") return "CANCELLED";
    const [newerCustomer] = await transaction.select({id: conversationMessages.id}).from(conversationMessages).where(and(
      eq(conversationMessages.conversationId, conversationId), gt(conversationMessages.position, triggerPosition), eq(conversationMessages.senderType, "CUSTOMER"),
    )).limit(1);
    if (newerCustomer) return "SUPERSEDED";
    const [staff] = await transaction.select({id: conversationMessages.id}).from(conversationMessages).where(and(
      eq(conversationMessages.conversationId, conversationId), gt(conversationMessages.position, triggerPosition), eq(conversationMessages.senderType, "INTERNAL_USER"),
    )).limit(1);
    return staff ? "CANCELLED" : null;
  }

  private async triggerExists(transaction: Parameters<Parameters<RoutingDatabase["transaction"]>[0]>[0], conversationId: string, triggerMessageId: string, triggerPosition: number): Promise<boolean> {
    const [trigger] = await transaction.select({id: conversationMessages.id}).from(conversationMessages).where(and(
      eq(conversationMessages.id, triggerMessageId), eq(conversationMessages.conversationId, conversationId),
      eq(conversationMessages.position, triggerPosition), eq(conversationMessages.senderType, "CUSTOMER"), eq(conversationMessages.channel, "WEBSITE"),
    )).limit(1);
    return trigger !== undefined;
  }

  private async terminalize(transaction: Parameters<Parameters<RoutingDatabase["transaction"]>[0]>[0], job: ClaimedConversationAiJob, status: "CANCELLED" | "SUPERSEDED", now: Date): Promise<void> {
    await transaction.update(conversationAiResponseJobs).set({
      status, leaseToken: null, leasedUntil: null, terminalAt: now, updatedAt: now,
      version: sql`${conversationAiResponseJobs.version} + 1`,
    }).where(and(eq(conversationAiResponseJobs.id, job.id), eq(conversationAiResponseJobs.status, "RUNNING"), eq(conversationAiResponseJobs.leaseToken, job.leaseToken)));
  }
}
