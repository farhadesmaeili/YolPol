import {and, asc, desc, eq} from "drizzle-orm";
import {drizzle} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";

import type {AiOperationsPolicyDto, AiOperationsPolicyEventDto, AiOperationsPolicyEventType} from "@/features/ai-operations/application/dto/ai-operations-dto";
import {toAiOperationsPolicyDto} from "@/features/ai-operations/application/mappers/ai-operations-policy-dto-mapper";
import {InvalidStoredAiOperationsPolicyError, type AiOperationsPolicyEvent, type AiOperationsPolicyRepository} from "@/features/ai-operations/application/ports/ai-operations-ports";
import {AiOperationsPolicy} from "@/features/ai-operations/domain/entities/ai-operations-policy";
import {AiOperationsPolicyValidationError} from "@/features/ai-operations/domain/errors/ai-operations-policy-errors";
import {aiOperationPolicy, aiOperationsPostgresSchema, aiPolicyEvents, aiScheduleWindows} from "@/features/ai-operations/infrastructure/persistence/postgres/schema/ai-operations-schema";

const singletonPolicyId = "global";

function restoreSnapshot(value: AiOperationsPolicyDto | null | undefined): AiOperationsPolicy | null {
  if (value === null || value === undefined) return null;
  return AiOperationsPolicy.restore({...value, updatedAt: new Date(value.updatedAt)});
}

function safeEventType(value: string): AiOperationsPolicyEventType {
  if (value !== "POLICY_CREATED" && value !== "POLICY_UPDATED") throw new InvalidStoredAiOperationsPolicyError();
  return value;
}

export class PostgresAiOperationsPolicyRepository implements AiOperationsPolicyRepository {
  private readonly database;

  constructor(pool: Pool) { this.database = drizzle(pool, {schema: aiOperationsPostgresSchema}); }

  async find(): Promise<AiOperationsPolicy | null> {
    const [row] = await this.database.select().from(aiOperationPolicy).where(eq(aiOperationPolicy.id, singletonPolicyId)).limit(1);
    if (!row) return null;
    const windows = await this.database.select().from(aiScheduleWindows)
      .where(eq(aiScheduleWindows.policyId, singletonPolicyId))
      .orderBy(asc(aiScheduleWindows.position));
    try {
      return AiOperationsPolicy.restore({
        mode: row.mode,
        businessTimeZone: row.businessTimeZone,
        humanGracePeriodSeconds: row.humanGracePeriodSeconds,
        version: row.version,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
        scheduleWindows: windows.map((window) => ({weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute, enabled: window.enabled})),
      });
    } catch (error) {
      if (error instanceof AiOperationsPolicyValidationError) throw new InvalidStoredAiOperationsPolicyError();
      throw error;
    }
  }

  async save(policy: AiOperationsPolicy, event: AiOperationsPolicyEvent, expectedVersion: number): Promise<"saved" | "conflict"> {
    if (policy.version !== expectedVersion + 1 || event.newPolicy !== policy || event.actorReference !== policy.updatedBy || event.occurredAt.getTime() !== policy.updatedAt.getTime()) {
      throw new Error("AI operations policy transaction invariant failed.");
    }
    const previousPolicy = event.previousPolicy ? toAiOperationsPolicyDto(event.previousPolicy) : null;
    const newPolicy = toAiOperationsPolicyDto(policy);
    return this.database.transaction(async (transaction) => {
      const persisted = expectedVersion === 0
        ? await transaction.insert(aiOperationPolicy).values({
            id: singletonPolicyId,
            mode: policy.mode,
            businessTimeZone: policy.businessTimeZone,
            humanGracePeriodSeconds: policy.humanGracePeriodSeconds,
            version: policy.version,
            updatedAt: policy.updatedAt,
            updatedBy: policy.updatedBy,
          }).onConflictDoNothing().returning({id: aiOperationPolicy.id})
        : await transaction.update(aiOperationPolicy).set({
            mode: policy.mode,
            businessTimeZone: policy.businessTimeZone,
            humanGracePeriodSeconds: policy.humanGracePeriodSeconds,
            version: policy.version,
            updatedAt: policy.updatedAt,
            updatedBy: policy.updatedBy,
          }).where(and(eq(aiOperationPolicy.id, singletonPolicyId), eq(aiOperationPolicy.version, expectedVersion))).returning({id: aiOperationPolicy.id});
      if (persisted.length !== 1) return "conflict" as const;
      await transaction.delete(aiScheduleWindows).where(eq(aiScheduleWindows.policyId, singletonPolicyId));
      if (policy.scheduleWindows.length > 0) {
        await transaction.insert(aiScheduleWindows).values(policy.scheduleWindows.map((window, position) => ({
          policyId: singletonPolicyId,
          position,
          weekday: window.weekday,
          startMinute: window.startMinute,
          endMinute: window.endMinute,
          enabled: window.enabled,
        })));
      }
      await transaction.insert(aiPolicyEvents).values({
        id: event.id,
        eventType: event.eventType,
        previousVersion: event.previousPolicy?.version ?? null,
        newVersion: policy.version,
        actorReference: event.actorReference,
        previousPolicy,
        newPolicy,
        occurredAt: event.occurredAt,
      });
      return "saved" as const;
    });
  }

  async readEvents(limit: number): Promise<readonly AiOperationsPolicyEventDto[]> {
    const rows = await this.database.select().from(aiPolicyEvents)
      .orderBy(desc(aiPolicyEvents.occurredAt), desc(aiPolicyEvents.id))
      .limit(limit);
    try {
      return Object.freeze(rows.map((row) => {
        const previous = restoreSnapshot(row.previousPolicy);
        const next = restoreSnapshot(row.newPolicy);
        const eventType = safeEventType(row.eventType);
        if (!next
          || next.version !== row.newVersion
          || (previous?.version ?? null) !== row.previousVersion
          || next.updatedBy !== row.actorReference
          || next.updatedAt.getTime() !== row.occurredAt.getTime()
          || (eventType === "POLICY_CREATED") !== (previous === null)) {
          throw new InvalidStoredAiOperationsPolicyError();
        }
        return Object.freeze({
          id: row.id,
          eventType,
          previousVersion: row.previousVersion,
          newVersion: row.newVersion,
          actorReference: row.actorReference,
          occurredAt: row.occurredAt.toISOString(),
          previousPolicy: previous ? toAiOperationsPolicyDto(previous) : null,
          newPolicy: toAiOperationsPolicyDto(next),
        });
      }));
    } catch (error) {
      if (error instanceof InvalidStoredAiOperationsPolicyError || error instanceof AiOperationsPolicyValidationError) throw new InvalidStoredAiOperationsPolicyError();
      throw error;
    }
  }
}
