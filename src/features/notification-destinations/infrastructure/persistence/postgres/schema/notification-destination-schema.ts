import {sql} from "drizzle-orm";
import {boolean, check, index, pgTable, timestamp, uniqueIndex, varchar} from "drizzle-orm/pg-core";

import {communicationRecipients, inquiryTeamMembers} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";
import {staffAccounts} from "@/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema";

export const telegramGroupConnectionRequests = pgTable("telegram_group_connection_requests", {
  id: varchar("id", {length: 128}).primaryKey(),
  staffAccountId: varchar("staff_account_id", {length: 128}).notNull().references(() => staffAccounts.id, {onDelete: "restrict"}),
  teamMemberId: varchar("team_member_id", {length: 128}).notNull().references(() => inquiryTeamMembers.id, {onDelete: "restrict"}),
  tokenLookup: varchar("token_lookup", {length: 64}).notNull(),
  tokenVerification: varchar("token_verification", {length: 64}).notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  expiresAt: timestamp("expires_at", {withTimezone: true, mode: "date"}).notNull(),
  consumedAt: timestamp("consumed_at", {withTimezone: true, mode: "date"}),
  revokedAt: timestamp("revoked_at", {withTimezone: true, mode: "date"}),
}, (table) => [
  uniqueIndex("telegram_group_connection_requests_lookup_uidx").on(table.tokenLookup),
  uniqueIndex("telegram_group_connection_requests_outstanding_staff_uidx").on(table.staffAccountId).where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
  check("telegram_group_connection_requests_id_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("telegram_group_connection_requests_lookup_check", sql`${table.tokenLookup} ~ '^[a-f0-9]{64}$'`),
  check("telegram_group_connection_requests_verification_check", sql`${table.tokenVerification} ~ '^[a-f0-9]{64}$'`),
  check("telegram_group_connection_requests_digest_separation_check", sql`${table.tokenLookup} <> ${table.tokenVerification}`),
  check("telegram_group_connection_requests_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  check("telegram_group_connection_requests_terminal_check", sql`${table.consumedAt} is null or ${table.revokedAt} is null`),
  index("telegram_group_connection_requests_expiry_idx").on(table.expiresAt),
]);

export const communicationRecipientEvents = pgTable("communication_recipient_events", {
  id: varchar("id", {length: 128}).primaryKey(),
  recipientId: varchar("recipient_id", {length: 128}).notNull().references(() => communicationRecipients.id, {onDelete: "restrict"}),
  eventType: varchar("event_type", {length: 48}).notNull(),
  destinationKind: varchar("destination_kind", {length: 20}).notNull(),
  displayName: varchar("display_name", {length: 120}).notNull(),
  actorReference: varchar("actor_reference", {length: 160}).notNull(),
  actorDisplayName: varchar("actor_display_name", {length: 120}).notNull(),
  previousAuthorized: boolean("previous_authorized").notNull(),
  previousNotificationsEnabled: boolean("previous_notifications_enabled").notNull(),
  newAuthorized: boolean("new_authorized").notNull(),
  newNotificationsEnabled: boolean("new_notifications_enabled").notNull(),
  occurredAt: timestamp("occurred_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  check("communication_recipient_events_id_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("communication_recipient_events_kind_check", sql`${table.destinationKind} in ('TEAM_GROUP','TEAM_MEMBER')`),
  check("communication_recipient_events_type_check", sql`${table.eventType} in ('TEAM_MEMBER_ENABLED','TEAM_MEMBER_DISABLED','TEAM_MEMBER_LINK_DISCONNECTED','TEAM_GROUP_AUTHORIZED','TEAM_GROUP_ENABLED','TEAM_GROUP_DISABLED','TEAM_GROUP_DISCONNECTED')`),
  check("communication_recipient_events_actor_check", sql`${table.actorReference} ~ '^staff:[A-Za-z0-9_-]{1,128}$'`),
  check("communication_recipient_events_new_state_check", sql`${table.newAuthorized} or not ${table.newNotificationsEnabled}`),
  index("communication_recipient_events_time_idx").on(table.occurredAt, table.id),
  index("communication_recipient_events_recipient_idx").on(table.recipientId, table.occurredAt),
]);

export const notificationDestinationPostgresSchema = {telegramGroupConnectionRequests, communicationRecipientEvents, communicationRecipients, inquiryTeamMembers, staffAccounts};
