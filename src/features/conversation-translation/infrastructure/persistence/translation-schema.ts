import {sql} from "drizzle-orm";
import {check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, varchar} from "drizzle-orm/pg-core";
import {conversationMessages} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

export const conversationMessageLanguages = pgTable("conversation_message_languages", {
  messageId: varchar("message_id", {length: 160}).primaryKey().references(() => conversationMessages.id, {onDelete: "cascade"}),
  sourceLocale: varchar("source_locale", {length: 2}),
  customerTargetLocale: varchar("customer_target_locale", {length: 2}),
  deliveryState: varchar("delivery_state", {length: 16}).notNull().default("ACTIVE"),
  version: integer("version").notNull().default(1),
}, (t) => [
  check("message_language_source_check", sql`${t.sourceLocale} in ('en','tr','fa','ar')`),
  check("message_language_target_check", sql`${t.customerTargetLocale} in ('en','tr','fa','ar')`),
  check("message_delivery_state_check", sql`${t.deliveryState} in ('ACTIVE','SKIPPED') and ${t.version} > 0`),
]);

export const conversationTranslationEvents = pgTable("conversation_translation_events", {
  id: varchar("id", {length: 64}).primaryKey(),
  messageId: varchar("message_id", {length: 160}).notNull().references(() => conversationMessages.id, {onDelete: "cascade"}),
  translationId: varchar("translation_id", {length: 180}),
  action: varchar("action", {length: 24}).notNull(),
  actorReference: varchar("actor_reference", {length: 180}).notNull(),
  previousState: varchar("previous_state", {length: 24}).notNull(),
  newState: varchar("new_state", {length: 24}).notNull(),
  previousVersion: integer("previous_version").notNull(),
  newVersion: integer("new_version").notNull(),
  createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
}, (t) => [
  index("translation_event_message_idx").on(t.messageId, t.createdAt),
  check("translation_event_action_check", sql`${t.action} in ('RETRY','SKIP','CONFIRM_LANGUAGE')`),
  check("translation_event_version_check", sql`${t.previousVersion} > 0 and ${t.newVersion} = ${t.previousVersion} + 1`),
  check("translation_event_actor_check", sql`${t.actorReference} ~ '^staff:[A-Za-z0-9_-]{1,160}$'`),
]);

export const conversationMessageTranslations = pgTable("conversation_message_translations", {
  id: varchar("id", {length: 180}).primaryKey(),
  messageId: varchar("message_id", {length: 160}).notNull().references(() => conversationMessages.id, {onDelete: "cascade"}),
  sourceLocale: varchar("source_locale", {length: 2}).notNull(),
  targetLocale: varchar("target_locale", {length: 2}).notNull(),
  status: varchar("status", {length: 20}).notNull(),
  body: text("body"),
  createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true}).notNull(),
  version: integer("version").notNull().default(1),
}, (t) => [
  uniqueIndex("translation_message_target_uidx").on(t.messageId, t.targetLocale),
  check("translation_locale_check", sql`${t.sourceLocale} in ('en','tr','fa','ar') and ${t.targetLocale} in ('en','tr','fa','ar') and ${t.sourceLocale} <> ${t.targetLocale}`),
  check("translation_status_check", sql`${t.status} in ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED')`),
  check("translation_body_check", sql`(${t.status} = 'SUCCEEDED' and ${t.body} is not null and char_length(${t.body}) between 1 and 10000) or (${t.status} <> 'SUCCEEDED' and ${t.body} is null)`),
  check("translation_version_check", sql`${t.version} > 0 and ${t.updatedAt} >= ${t.createdAt}`),
]);

export const conversationTranslationJobs = pgTable("conversation_translation_jobs", {
  id: varchar("id", {length: 180}).primaryKey().references(() => conversationMessageTranslations.id, {onDelete: "cascade"}),
  messageId: varchar("message_id", {length: 160}).notNull(),
  targetLocale: varchar("target_locale", {length: 2}).notNull(),
  executionId: varchar("execution_id", {length: 200}).notNull(),
  status: varchar("status", {length: 20}).notNull(),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: varchar("lease_token", {length: 64}),
  leasedUntil: timestamp("leased_until", {withTimezone: true}),
  failureCategory: varchar("failure_category", {length: 64}),
  createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true}).notNull(),
  version: integer("version").notNull().default(1),
}, (t) => [
  uniqueIndex("translation_job_message_target_uidx").on(t.messageId, t.targetLocale),
  uniqueIndex("translation_job_execution_uidx").on(t.executionId),
  foreignKey({columns: [t.messageId, t.targetLocale], foreignColumns: [conversationMessageTranslations.messageId, conversationMessageTranslations.targetLocale]}).onDelete("cascade"),
  index("translation_job_claim_idx").on(t.status, t.leasedUntil, t.createdAt),
  check("translation_job_status_check", sql`${t.status} in ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED')`),
  check("translation_job_lease_check", sql`(${t.status} = 'RUNNING' and ${t.leaseToken} is not null and ${t.leasedUntil} is not null) or (${t.status} <> 'RUNNING' and ${t.leaseToken} is null and ${t.leasedUntil} is null)`),
  check("translation_job_version_check", sql`${t.version} > 0 and ${t.attempts} between 0 and 3 and ${t.updatedAt} >= ${t.createdAt}`),
]);
