import {sql} from "drizzle-orm";
import {check, index, integer, pgTable, timestamp, uniqueIndex, varchar} from "drizzle-orm/pg-core";

import {conversationMessages, conversations} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

export const conversationAiControls = pgTable("conversation_ai_controls", {
  conversationId: varchar("conversation_id", {length: 128}).primaryKey().references(() => conversations.id, {onDelete: "cascade"}),
  state: varchar("state", {length: 24}).notNull(),
  version: integer("version").notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedBy: varchar("updated_by", {length: 160}).notNull(),
}, (table) => [
  check("conversation_ai_controls_state_check", sql`${table.state} in ('AUTO','PAUSED','HUMAN_TAKEOVER')`),
  check("conversation_ai_controls_version_check", sql`${table.version} >= 1`),
  check("conversation_ai_controls_actor_check", sql`${table.updatedBy} ~ '^staff:[A-Za-z0-9_-]{1,128}$'`),
]);

export const conversationAiControlEvents = pgTable("conversation_ai_control_events", {
  id: varchar("id", {length: 128}).primaryKey(),
  conversationId: varchar("conversation_id", {length: 128}).notNull().references(() => conversations.id, {onDelete: "cascade"}),
  previousState: varchar("previous_state", {length: 24}).notNull(),
  newState: varchar("new_state", {length: 24}).notNull(),
  previousVersion: integer("previous_version").notNull(),
  newVersion: integer("new_version").notNull(),
  actorReference: varchar("actor_reference", {length: 160}).notNull(),
  occurredAt: timestamp("occurred_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  check("conversation_ai_control_events_id_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("conversation_ai_control_events_states_check", sql`${table.previousState} in ('AUTO','PAUSED','HUMAN_TAKEOVER') and ${table.newState} in ('AUTO','PAUSED','HUMAN_TAKEOVER') and ${table.previousState} <> ${table.newState}`),
  check("conversation_ai_control_events_versions_check", sql`${table.previousVersion} >= 0 and ${table.newVersion} = ${table.previousVersion} + 1`),
  check("conversation_ai_control_events_actor_check", sql`${table.actorReference} ~ '^staff:[A-Za-z0-9_-]{1,128}$'`),
  index("conversation_ai_control_events_conversation_idx").on(table.conversationId, table.occurredAt, table.id),
]);

export const conversationAiResponseJobs = pgTable("conversation_ai_response_jobs", {
  id: varchar("id", {length: 128}).primaryKey(),
  conversationId: varchar("conversation_id", {length: 128}).notNull().references(() => conversations.id, {onDelete: "cascade"}),
  triggerMessageId: varchar("trigger_message_id", {length: 160}).notNull().references(() => conversationMessages.id, {onDelete: "cascade"}),
  triggerMessagePosition: integer("trigger_message_position").notNull(),
  status: varchar("status", {length: 16}).notNull(),
  notBefore: timestamp("not_before", {withTimezone: true, mode: "date"}).notNull(),
  executionId: varchar("execution_id", {length: 128}).notNull(),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: varchar("lease_token", {length: 128}),
  leasedUntil: timestamp("leased_until", {withTimezone: true, mode: "date"}),
  failureCategory: varchar("failure_category", {length: 64}),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
  terminalAt: timestamp("terminal_at", {withTimezone: true, mode: "date"}),
  version: integer("version").notNull().default(1),
}, (table) => [
  uniqueIndex("conversation_ai_response_jobs_trigger_uidx").on(table.triggerMessageId),
  uniqueIndex("conversation_ai_response_jobs_execution_uidx").on(table.executionId),
  check("conversation_ai_response_jobs_id_check", sql`${table.id} ~ '^ai_job_[A-Za-z0-9_-]{1,96}$'`),
  check("conversation_ai_response_jobs_position_check", sql`${table.triggerMessagePosition} >= 0`),
  check("conversation_ai_response_jobs_status_check", sql`${table.status} in ('PENDING','RUNNING','SUCCEEDED','CANCELLED','SUPERSEDED','FAILED')`),
  check("conversation_ai_response_jobs_attempts_check", sql`${table.attempts} between 0 and 3`),
  check("conversation_ai_response_jobs_version_check", sql`${table.version} >= 1`),
  check("conversation_ai_response_jobs_lease_check", sql`(${table.status} = 'RUNNING' and ${table.leaseToken} is not null and ${table.leasedUntil} is not null) or (${table.status} <> 'RUNNING' and ${table.leaseToken} is null and ${table.leasedUntil} is null)`),
  check("conversation_ai_response_jobs_terminal_check", sql`(${table.status} in ('SUCCEEDED','CANCELLED','SUPERSEDED','FAILED') and ${table.terminalAt} is not null) or (${table.status} in ('PENDING','RUNNING') and ${table.terminalAt} is null)`),
  check("conversation_ai_response_jobs_failure_check", sql`(${table.status} = 'FAILED' and ${table.failureCategory} is not null) or (${table.status} <> 'FAILED' and ${table.failureCategory} is null)`),
  check("conversation_ai_response_jobs_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt} and ${table.notBefore} >= ${table.createdAt} and (${table.terminalAt} is null or ${table.terminalAt} >= ${table.createdAt})`),
  index("conversation_ai_response_jobs_due_idx").on(table.status, table.notBefore, table.leasedUntil),
  index("conversation_ai_response_jobs_conversation_idx").on(table.conversationId, table.createdAt),
]);

export const conversationAiRoutingPostgresSchema = {conversationAiControls, conversationAiControlEvents, conversationAiResponseJobs};
