import {sql} from "drizzle-orm";
import {bigserial, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar} from "drizzle-orm/pg-core";

export const inquiries = pgTable("inquiries", {
  id: varchar("id", {length: 128}).primaryKey(),
  status: varchar("status", {length: 20}).notNull(),
  fullName: varchar("full_name", {length: 120}).notNull(),
  company: varchar("company", {length: 160}),
  email: varchar("email", {length: 254}).notNull(),
  phone: varchar("phone", {length: 40}).notNull(),
  whatsappPhone: varchar("whatsapp_phone", {length: 40}),
  telegramUsername: varchar("telegram_username", {length: 33}),
  preferredContactMethods: varchar("preferred_contact_methods", {length: 20}).array().notNull(),
  country: varchar("country", {length: 100}).notNull(),
  city: varchar("city", {length: 100}),
  destinationCountry: varchar("destination_country", {length: 100}),
  destinationCity: varchar("destination_city", {length: 100}),
  message: text("message"),
  sourceLocale: varchar("source_locale", {length: 2}).notNull(),
  sourcePath: text("source_path").notNull(),
  privacyAccepted: boolean("privacy_accepted").notNull(),
  privacyAcceptedAt: timestamp("privacy_accepted_at", {withTimezone: true, mode: "date"}).notNull(),
  privacyPolicyVersion: varchar("privacy_policy_version", {length: 100}).notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  check("inquiries_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("inquiries_status_check", sql`${table.status} in ('NEW','WAITING_FOR_TEAM','WAITING_FOR_CUSTOMER','QUOTED','CONFIRMED','CLOSED')`),
  check("inquiries_preferred_contacts_check", sql`${table.preferredContactMethods} in (array['email']::varchar[], array['whatsapp']::varchar[], array['telegram']::varchar[], array['phone']::varchar[], array['email','whatsapp']::varchar[], array['email','telegram']::varchar[], array['whatsapp','telegram']::varchar[], array['email','whatsapp','telegram']::varchar[])`),
  check("inquiries_whatsapp_contact_check", sql`${table.whatsappPhone} is null or 'whatsapp' = any(${table.preferredContactMethods})`),
  check("inquiries_telegram_contact_check", sql`${table.telegramUsername} is null or 'telegram' = any(${table.preferredContactMethods})`),
  check("inquiries_source_locale_check", sql`${table.sourceLocale} in ('en','tr','fa','ar')`),
  check("inquiries_privacy_accepted_check", sql`${table.privacyAccepted} = true`),
  check("inquiries_destination_city_check", sql`${table.destinationCity} is null or ${table.destinationCountry} is not null`),
  check("inquiries_message_length_check", sql`${table.message} is null or char_length(${table.message}) between 1 and 2000`),
  check("inquiries_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt} and ${table.privacyAcceptedAt} <= ${table.createdAt}`),
  index("inquiries_created_at_idx").on(table.createdAt),
]);

export const inquiryItems = pgTable("inquiry_items", {
  inquiryId: varchar("inquiry_id", {length: 128}).notNull().references(() => inquiries.id, {onDelete: "cascade"}),
  position: integer("position").notNull(),
  productId: varchar("product_id", {length: 64}).notNull(),
  sku: varchar("sku", {length: 64}).notNull(),
  slug: varchar("slug", {length: 120}).notNull(),
  productName: varchar("product_name", {length: 120}).notNull(),
  quantity: integer("quantity").notNull(),
  unit: varchar("unit", {length: 20}).notNull(),
}, (table) => [
  primaryKey({name: "inquiry_items_pkey", columns: [table.inquiryId, table.position]}),
  uniqueIndex("inquiry_items_inquiry_product_uidx").on(table.inquiryId, table.productId),
  check("inquiry_items_position_check", sql`${table.position} >= 0`),
  check("inquiry_items_product_id_format_check", sql`${table.productId} ~ '^[A-Za-z0-9]([A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$'`),
  check("inquiry_items_sku_format_check", sql`${table.sku} ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'`),
  check("inquiry_items_slug_format_check", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("inquiry_items_product_name_length_check", sql`char_length(${table.productName}) between 2 and 120`),
  check("inquiry_items_quantity_check", sql`${table.quantity} between 1 and 1000000000`),
  check("inquiry_items_unit_check", sql`${table.unit} in ('pieces','packages','pallets','truckloads')`),
]);

export const conversations = pgTable("conversations", {
  id: varchar("id", {length: 128}).primaryKey(),
  inquiryId: varchar("inquiry_id", {length: 128}).notNull().references(() => inquiries.id, {onDelete: "cascade"}),
  channel: varchar("channel", {length: 20}).notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  uniqueIndex("conversations_inquiry_id_uidx").on(table.inquiryId),
  check("conversations_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("conversations_channel_check", sql`${table.channel} in ('WEBSITE','TELEGRAM','EMAIL','WHATSAPP')`),
]);

export const conversationAccess = pgTable("conversation_access", {
  conversationId: varchar("conversation_id", {length: 128}).primaryKey().references(() => conversations.id, {onDelete: "cascade"}),
  tokenLookup: varchar("token_lookup", {length: 64}).notNull(),
  tokenHash: varchar("token_hash", {length: 64}).notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  expiresAt: timestamp("expires_at", {withTimezone: true, mode: "date"}),
}, (table) => [
  uniqueIndex("conversation_access_token_lookup_uidx").on(table.tokenLookup),
  check("conversation_access_token_lookup_format_check", sql`${table.tokenLookup} ~ '^[a-f0-9]{64}$'`),
  check("conversation_access_token_hash_format_check", sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
  check("conversation_access_expiration_check", sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`),
]);

export const conversationMessages = pgTable("conversation_messages", {
  id: varchar("id", {length: 160}).primaryKey(),
  conversationId: varchar("conversation_id", {length: 128}).notNull().references(() => conversations.id, {onDelete: "cascade"}),
  position: integer("position").notNull(),
  senderType: varchar("sender_type", {length: 20}).notNull(),
  channel: varchar("channel", {length: 20}).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  uniqueIndex("conversation_messages_position_uidx").on(table.conversationId, table.position),
  check("conversation_messages_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,160}$'`),
  check("conversation_messages_position_check", sql`${table.position} >= 0`),
  check("conversation_messages_sender_type_check", sql`${table.senderType} in ('CUSTOMER','INTERNAL_USER','AI_AGENT','SYSTEM')`),
  check("conversation_messages_channel_check", sql`${table.channel} in ('WEBSITE','TELEGRAM','EMAIL','WHATSAPP')`),
  check("conversation_messages_body_length_check", sql`char_length(${table.body}) between 1 and 10000`),
]);

export const communicationRecipients = pgTable("communication_recipients", {
  id: varchar("id", {length: 128}).primaryKey(),
  channel: varchar("channel", {length: 20}).notNull(),
  kind: varchar("kind", {length: 20}).notNull(),
  externalId: varchar("external_id", {length: 160}).notNull(),
  displayName: varchar("display_name", {length: 120}).notNull(),
  authorized: boolean("authorized").notNull().default(false),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  uniqueIndex("communication_recipients_channel_external_uidx").on(table.channel, table.externalId),
  check("communication_recipients_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("communication_recipients_channel_check", sql`${table.channel} in ('TELEGRAM','EMAIL','WHATSAPP')`),
  check("communication_recipients_kind_check", sql`${table.kind} in ('TEAM_GROUP','TEAM_MEMBER')`),
  check("communication_recipients_external_id_length_check", sql`char_length(${table.externalId}) between 1 and 160`),
  check("communication_recipients_display_name_length_check", sql`char_length(${table.displayName}) between 1 and 120`),
  check("communication_recipients_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  index("communication_recipients_notifications_idx").on(table.channel, table.authorized, table.notificationsEnabled),
]);

export const inquiryTeamMembers = pgTable("inquiry_team_members", {
  id: varchar("id", {length: 128}).primaryKey(),
  displayName: varchar("display_name", {length: 120}).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  check("inquiry_team_members_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("inquiry_team_members_display_name_length_check", sql`char_length(${table.displayName}) between 1 and 120`),
  check("inquiry_team_members_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  index("inquiry_team_members_active_idx").on(table.active, table.id),
]);

export const inquiryAssignments = pgTable("inquiry_assignments", {
  inquiryId: varchar("inquiry_id", {length: 128}).primaryKey().references(() => inquiries.id, {onDelete: "cascade"}),
  teamMemberId: varchar("team_member_id", {length: 128}).notNull().references(() => inquiryTeamMembers.id, {onDelete: "restrict"}),
  assignedAt: timestamp("assigned_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [index("inquiry_assignments_team_member_idx").on(table.teamMemberId, table.assignedAt)]);

export const inquiryWorkflowEvents = pgTable("inquiry_workflow_events", {
  id: bigserial("id", {mode: "bigint"}).primaryKey(),
  inquiryId: varchar("inquiry_id", {length: 128}).notNull().references(() => inquiries.id, {onDelete: "cascade"}),
  eventType: varchar("event_type", {length: 32}).notNull(),
  previousValue: varchar("previous_value", {length: 128}),
  newValue: varchar("new_value", {length: 128}),
  actorReference: varchar("actor_reference", {length: 160}),
  occurredAt: timestamp("occurred_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  check("inquiry_workflow_events_type_check", sql`${table.eventType} in ('INQUIRY_CREATED','STATUS_CHANGED','ASSIGNED','UNASSIGNED')`),
  check("inquiry_workflow_events_values_check", sql`
    (${table.eventType} = 'INQUIRY_CREATED' and ${table.previousValue} is null and ${table.newValue} in ('NEW','WAITING_FOR_TEAM','WAITING_FOR_CUSTOMER','QUOTED','CONFIRMED','CLOSED')) or
    (${table.eventType} = 'STATUS_CHANGED' and ${table.previousValue} in ('NEW','WAITING_FOR_TEAM','WAITING_FOR_CUSTOMER','QUOTED','CONFIRMED','CLOSED') and ${table.newValue} in ('NEW','WAITING_FOR_TEAM','WAITING_FOR_CUSTOMER','QUOTED','CONFIRMED','CLOSED') and ${table.previousValue} <> ${table.newValue}) or
    (${table.eventType} = 'ASSIGNED' and ${table.newValue} is not null) or
    (${table.eventType} = 'UNASSIGNED' and ${table.previousValue} is not null and ${table.newValue} is null)
  `),
  check("inquiry_workflow_events_actor_check", sql`${table.actorReference} is null or char_length(${table.actorReference}) between 1 and 160`),
  index("inquiry_workflow_events_inquiry_time_idx").on(table.inquiryId, table.occurredAt, table.id),
]);

export const inquiryOutbox = pgTable("inquiry_outbox", {
  id: varchar("id", {length: 160}).primaryKey(),
  eventType: varchar("event_type", {length: 64}).notNull(),
  aggregateId: varchar("aggregate_id", {length: 128}).notNull().references(() => inquiries.id, {onDelete: "cascade"}),
  payload: jsonb("payload").$type<Readonly<{inquiryId: string; occurredAt: string}>>().notNull(),
  occurredAt: timestamp("occurred_at", {withTimezone: true, mode: "date"}).notNull(),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", {withTimezone: true, mode: "date"}).notNull(),
  lockedUntil: timestamp("locked_until", {withTimezone: true, mode: "date"}),
  processedAt: timestamp("processed_at", {withTimezone: true, mode: "date"}),
}, (table) => [
  check("inquiry_outbox_event_type_check", sql`${table.eventType} = 'InquiryCreated'`),
  check("inquiry_outbox_attempts_check", sql`${table.attempts} >= 0`),
  index("inquiry_outbox_pending_idx").on(table.availableAt, table.occurredAt).where(sql`${table.processedAt} is null`),
]);

export const inquiryPostgresSchema = {inquiries, inquiryItems, conversations, conversationAccess, conversationMessages, communicationRecipients, inquiryTeamMembers, inquiryAssignments, inquiryWorkflowEvents, inquiryOutbox};
