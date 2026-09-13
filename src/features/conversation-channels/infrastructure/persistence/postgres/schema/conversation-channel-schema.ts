import {sql, type SQLWrapper} from "drizzle-orm";
import {check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex, varchar} from "drizzle-orm/pg-core";

import {conversationMessages, conversations} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

function opaqueReference(column: SQLWrapper) {
  // Include ECMAScript whitespace explicitly so DB locale settings cannot admit aliases.
  return sql`char_length(${column}) between 1 and 160
    and ${column} !~ U&'[[:space:][:cntrl:]<>\\00A0\\1680\\2000-\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF]'
    and ${column} !~* '^[a-z][a-z0-9+.-]*://'`;
}

export const conversationChannelBindings = pgTable("conversation_channel_bindings", {
  id: varchar("id", {length: 128}).primaryKey(),
  conversationId: varchar("conversation_id", {length: 128}).notNull().references(() => conversations.id, {onDelete: "cascade"}),
  channel: varchar("channel", {length: 20}).notNull(),
  providerKey: varchar("provider_key", {length: 64}).notNull(),
  externalAccountReference: varchar("external_account_reference", {length: 160}).notNull(),
  externalConversationReference: varchar("external_conversation_reference", {length: 160}).notNull(),
  externalParticipantReference: varchar("external_participant_reference", {length: 160}).notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  uniqueIndex("conversation_channel_bindings_id_conversation_uidx").on(table.id, table.conversationId),
  uniqueIndex("conversation_channel_bindings_external_conversation_uidx").on(
    table.channel, table.providerKey, table.externalAccountReference, table.externalConversationReference,
  ),
  check("conversation_channel_bindings_id_check", sql`${table.id} ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'`),
  check("conversation_channel_bindings_channel_check", sql`${table.channel} in ('TELEGRAM','INSTAGRAM','EMAIL','WHATSAPP')`),
  check("conversation_channel_bindings_provider_check", sql`${table.providerKey} ~ '^[a-z][a-z0-9_-]{0,63}$'`),
  check("conversation_channel_bindings_external_references_check", sql`
    ${opaqueReference(table.externalAccountReference)} and
    ${opaqueReference(table.externalConversationReference)} and
    ${opaqueReference(table.externalParticipantReference)}
  `),
  check("conversation_channel_bindings_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  index("conversation_channel_bindings_conversation_idx").on(table.conversationId, table.channel),
]);

export const conversationChannelInboundMessages = pgTable("conversation_channel_inbound_messages", {
  id: varchar("id", {length: 128}).primaryKey(),
  bindingId: varchar("binding_id", {length: 128}).notNull(),
  conversationId: varchar("conversation_id", {length: 128}).notNull(),
  externalMessageReference: varchar("external_message_reference", {length: 160}).notNull(),
  body: text("body").notNull(),
  occurredAt: timestamp("occurred_at", {withTimezone: true, mode: "date"}).notNull(),
  receivedAt: timestamp("received_at", {withTimezone: true, mode: "date"}).notNull(),
  correlatedMessageId: varchar("correlated_message_id", {length: 160}),
  correlatedAt: timestamp("correlated_at", {withTimezone: true, mode: "date"}),
}, (table) => [
  foreignKey({
    columns: [table.bindingId, table.conversationId],
    foreignColumns: [conversationChannelBindings.id, conversationChannelBindings.conversationId],
    name: "conversation_channel_inbound_binding_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.correlatedMessageId, table.conversationId],
    foreignColumns: [conversationMessages.id, conversationMessages.conversationId],
    name: "conversation_channel_inbound_message_fk",
  }).onDelete("cascade"),
  uniqueIndex("conversation_channel_inbound_external_message_uidx").on(table.bindingId, table.externalMessageReference),
  check("conversation_channel_inbound_id_check", sql`${table.id} ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'`),
  check("conversation_channel_inbound_external_reference_check", opaqueReference(table.externalMessageReference)),
  check("conversation_channel_inbound_body_check", sql`char_length(${table.body}) between 1 and 10000
    and ${table.body} ~ U&'[^[:space:]\\00A0\\1680\\2000-\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF]'
    and ${table.body} !~ U&'[\\0001-\\0008\\000B\\000C\\000E-\\001F\\007F]'
    and ${table.body} !~* '</?[a-z][^>]*>'`),
  check("conversation_channel_inbound_correlation_check", sql`
    (${table.correlatedMessageId} is null and ${table.correlatedAt} is null) or
    (${table.correlatedMessageId} is not null and ${table.correlatedAt} is not null and ${table.correlatedAt} >= ${table.receivedAt})
  `),
  index("conversation_channel_inbound_conversation_idx").on(table.conversationId, table.receivedAt),
]);

export const conversationChannelDeliveries = pgTable("conversation_channel_deliveries", {
  id: varchar("id", {length: 128}).primaryKey(),
  conversationId: varchar("conversation_id", {length: 128}).notNull(),
  messageId: varchar("message_id", {length: 160}).notNull(),
  bindingId: varchar("binding_id", {length: 128}).notNull(),
  status: varchar("status", {length: 20}).notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", {withTimezone: true, mode: "date"}).notNull(),
  leaseToken: varchar("lease_token", {length: 128}),
  leasedUntil: timestamp("leased_until", {withTimezone: true, mode: "date"}),
  providerMessageReference: varchar("provider_message_reference", {length: 160}),
  failureCategory: varchar("failure_category", {length: 64}),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
  deliveredAt: timestamp("delivered_at", {withTimezone: true, mode: "date"}),
  terminalAt: timestamp("terminal_at", {withTimezone: true, mode: "date"}),
  version: integer("version").notNull().default(1),
}, (table) => [
  foreignKey({
    columns: [table.messageId, table.conversationId],
    foreignColumns: [conversationMessages.id, conversationMessages.conversationId],
    name: "conversation_channel_deliveries_message_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.bindingId, table.conversationId],
    foreignColumns: [conversationChannelBindings.id, conversationChannelBindings.conversationId],
    name: "conversation_channel_deliveries_binding_fk",
  }).onDelete("cascade"),
  uniqueIndex("conversation_channel_deliveries_message_binding_uidx").on(table.messageId, table.bindingId),
  uniqueIndex("conversation_channel_deliveries_provider_message_uidx").on(table.bindingId, table.providerMessageReference)
    .where(sql`${table.providerMessageReference} is not null`),
  check("conversation_channel_deliveries_id_check", sql`${table.id} ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'`),
  check("conversation_channel_deliveries_status_check", sql`${table.status} in ('PENDING','RUNNING','DELIVERED','FAILED','UNKNOWN')`),
  check("conversation_channel_deliveries_attempts_check", sql`${table.attempts} between 0 and 3 and ${table.version} >= 1
    and ((${table.status} = 'PENDING' and ${table.attempts} < 3) or (${table.status} <> 'PENDING' and ${table.attempts} >= 1))`),
  check("conversation_channel_deliveries_lease_check", sql`
    (${table.status} = 'RUNNING' and ${table.leaseToken} is not null and ${table.leasedUntil} is not null
      and ${table.leaseToken} ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' and ${table.leasedUntil} > ${table.updatedAt}) or
    (${table.status} <> 'RUNNING' and ${table.leaseToken} is null and ${table.leasedUntil} is null)
  `),
  check("conversation_channel_deliveries_failure_check", sql`
    (${table.failureCategory} is null or ${table.failureCategory} in
      ('AUTHENTICATION','AUTHORIZATION','DESTINATION_NOT_FOUND','INVALID_REQUEST','RATE_LIMITED','PROVIDER_UNAVAILABLE','TIMEOUT','MALFORMED_RESPONSE','INFRASTRUCTURE_FAILURE','UNKNOWN_OUTCOME'))
    and (${table.status} <> 'RUNNING' or ${table.failureCategory} is null)
    and (${table.status} = 'UNKNOWN' or ${table.failureCategory} is distinct from 'UNKNOWN_OUTCOME')
  `),
  check("conversation_channel_deliveries_provider_reference_check", sql`${table.providerMessageReference} is null or (${opaqueReference(table.providerMessageReference)})`),
  check("conversation_channel_deliveries_outcome_check", sql`
    (${table.status} = 'DELIVERED' and ${table.providerMessageReference} is not null and ${table.deliveredAt} is not null and ${table.terminalAt} is not null and ${table.failureCategory} is null) or
    (${table.status} = 'FAILED' and ${table.providerMessageReference} is null and ${table.deliveredAt} is null and ${table.terminalAt} is not null and ${table.failureCategory} is not null) or
    (${table.status} = 'UNKNOWN' and ${table.providerMessageReference} is null and ${table.deliveredAt} is null and ${table.terminalAt} is not null and ${table.failureCategory} is not distinct from 'UNKNOWN_OUTCOME') or
    (${table.status} in ('PENDING','RUNNING') and ${table.providerMessageReference} is null and ${table.deliveredAt} is null and ${table.terminalAt} is null)
  `),
  check("conversation_channel_deliveries_timestamps_check", sql`
    ${table.updatedAt} >= ${table.createdAt} and ${table.availableAt} >= ${table.createdAt} and
    (${table.deliveredAt} is null or ${table.deliveredAt} >= ${table.createdAt}) and
    (${table.terminalAt} is null or ${table.terminalAt} >= ${table.createdAt})
  `),
  index("conversation_channel_deliveries_due_idx").on(table.status, table.availableAt, table.leasedUntil),
  index("conversation_channel_deliveries_conversation_idx").on(table.conversationId, table.createdAt),
]);

export const conversationChannelPostgresSchema = {
  conversationChannelBindings,
  conversationChannelInboundMessages,
  conversationChannelDeliveries,
};
