import {sql} from "drizzle-orm";
import {boolean, check, index, integer, jsonb, pgTable, primaryKey, timestamp, varchar} from "drizzle-orm/pg-core";

import type {AiOperationsPolicyDto} from "@/features/ai-operations/application/dto/ai-operations-dto";

export const aiOperationPolicy = pgTable("ai_operation_policy", {
  id: varchar("id", {length: 32}).primaryKey(),
  mode: varchar("mode", {length: 16}).notNull(),
  businessTimeZone: varchar("business_time_zone", {length: 64}).notNull(),
  humanGracePeriodSeconds: integer("human_grace_period_seconds").notNull(),
  version: integer("version").notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedBy: varchar("updated_by", {length: 160}).notNull(),
}, (table) => [
  check("ai_operation_policy_singleton_check", sql`${table.id} = 'global'`),
  check("ai_operation_policy_mode_check", sql`${table.mode} in ('DISABLED','FALLBACK','SCHEDULED')`),
  check("ai_operation_policy_grace_check", sql`${table.humanGracePeriodSeconds} between 60 and 86400`),
  check("ai_operation_policy_version_check", sql`${table.version} >= 1`),
  check("ai_operation_policy_actor_check", sql`${table.updatedBy} ~ '^staff:[A-Za-z0-9_-]{1,128}$'`),
]);

export const aiScheduleWindows = pgTable("ai_schedule_windows", {
  policyId: varchar("policy_id", {length: 32}).notNull().references(() => aiOperationPolicy.id, {onDelete: "cascade"}),
  position: integer("position").notNull(),
  weekday: varchar("weekday", {length: 9}).notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  enabled: boolean("enabled").notNull(),
}, (table) => [
  primaryKey({name: "ai_schedule_windows_pkey", columns: [table.policyId, table.position]}),
  check("ai_schedule_windows_position_check", sql`${table.position} >= 0 and ${table.position} < 64`),
  check("ai_schedule_windows_weekday_check", sql`${table.weekday} in ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY')`),
  check("ai_schedule_windows_minutes_check", sql`${table.startMinute} >= 0 and ${table.startMinute} <= 1439 and ${table.endMinute} >= 1 and ${table.endMinute} <= 1440 and ${table.startMinute} < ${table.endMinute}`),
]);

export const aiPolicyEvents = pgTable("ai_policy_events", {
  id: varchar("id", {length: 128}).primaryKey(),
  eventType: varchar("event_type", {length: 32}).notNull(),
  previousVersion: integer("previous_version"),
  newVersion: integer("new_version").notNull(),
  actorReference: varchar("actor_reference", {length: 160}).notNull(),
  previousPolicy: jsonb("previous_policy").$type<AiOperationsPolicyDto | null>(),
  newPolicy: jsonb("new_policy").$type<AiOperationsPolicyDto>().notNull(),
  occurredAt: timestamp("occurred_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  check("ai_policy_events_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("ai_policy_events_type_check", sql`${table.eventType} in ('POLICY_CREATED','POLICY_UPDATED')`),
  check("ai_policy_events_versions_check", sql`${table.newVersion} >= 1 and (${table.previousVersion} is null or ${table.previousVersion} >= 1 and ${table.newVersion} = ${table.previousVersion} + 1)`),
  check("ai_policy_events_actor_check", sql`${table.actorReference} ~ '^staff:[A-Za-z0-9_-]{1,128}$'`),
  check("ai_policy_events_creation_shape_check", sql`(${table.eventType} = 'POLICY_CREATED' and ${table.previousVersion} is null and ${table.previousPolicy} is null) or (${table.eventType} = 'POLICY_UPDATED' and ${table.previousVersion} is not null and ${table.previousPolicy} is not null)`),
  index("ai_policy_events_occurred_at_idx").on(table.occurredAt, table.id),
]);

export const aiOperationsPostgresSchema = {aiOperationPolicy, aiScheduleWindows, aiPolicyEvents};
