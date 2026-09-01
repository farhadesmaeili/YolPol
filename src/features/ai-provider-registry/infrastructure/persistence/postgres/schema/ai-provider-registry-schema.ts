import {sql} from "drizzle-orm";
import {boolean, check, doublePrecision, index, integer, jsonb, pgTable, primaryKey, timestamp, uniqueIndex, varchar} from "drizzle-orm/pg-core";

import type {AiProviderRegistryDto, AiRegistryAuditSnapshot} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";

const actorCheck = (column: {name: string}) => sql`${column} ~ '^staff:[A-Za-z0-9_-]{1,128}$'`;

export const aiProviderConfigs = pgTable("ai_provider_configs", {
  id: varchar("id", {length: 64}).primaryKey(), adapterKey: varchar("adapter_key", {length: 48}).notNull(), displayName: varchar("display_name", {length: 120}).notNull(),
  enabled: boolean("enabled").notNull(), priority: integer("priority").notNull(), version: integer("version").notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(), updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(), updatedBy: varchar("updated_by", {length: 160}).notNull(),
}, (table) => [
  check("ai_provider_configs_id_check", sql`${table.id} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`),
  check("ai_provider_configs_adapter_key_check", sql`${table.adapterKey} ~ '^[a-z][a-z0-9-]{0,47}$'`),
  check("ai_provider_configs_display_name_check", sql`length(btrim(${table.displayName})) between 1 and 120 and ${table.displayName} !~ '[<>]'`),
  check("ai_provider_configs_priority_check", sql`${table.priority} between 0 and 1000000`), check("ai_provider_configs_version_check", sql`${table.version} >= 1`),
  check("ai_provider_configs_time_check", sql`${table.updatedAt} >= ${table.createdAt}`), check("ai_provider_configs_actor_check", actorCheck(table.updatedBy)),
  index("ai_provider_configs_order_idx").on(table.priority, table.id),
]);

export const aiModelProfiles = pgTable("ai_model_profiles", {
  id: varchar("id", {length: 64}).primaryKey(), providerId: varchar("provider_id", {length: 64}).notNull().references(() => aiProviderConfigs.id), name: varchar("name", {length: 120}).notNull(),
  modelIdentifier: varchar("model_identifier", {length: 160}).notNull(), enabled: boolean("enabled").notNull(), priority: integer("priority").notNull(),
  temperature: doublePrecision("temperature"), topP: doublePrecision("top_p"), maxOutputTokens: integer("max_output_tokens").notNull(), version: integer("version").notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(), updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(), updatedBy: varchar("updated_by", {length: 160}).notNull(),
}, (table) => [
  check("ai_model_profiles_id_check", sql`${table.id} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`), check("ai_model_profiles_name_check", sql`length(btrim(${table.name})) between 1 and 120 and ${table.name} !~ '[<>]'`),
  check("ai_model_profiles_model_id_check", sql`${table.modelIdentifier} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'`), check("ai_model_profiles_priority_check", sql`${table.priority} between 0 and 1000000`),
  check("ai_model_profiles_temperature_check", sql`${table.temperature} is null or ${table.temperature} between 0 and 2`), check("ai_model_profiles_top_p_check", sql`${table.topP} is null or ${table.topP} between 0 and 1`),
  check("ai_model_profiles_output_tokens_check", sql`${table.maxOutputTokens} between 1 and 131072`), check("ai_model_profiles_version_check", sql`${table.version} >= 1`),
  check("ai_model_profiles_time_check", sql`${table.updatedAt} >= ${table.createdAt}`), check("ai_model_profiles_actor_check", actorCheck(table.updatedBy)),
  uniqueIndex("ai_model_profiles_provider_name_idx").on(table.providerId, table.name), index("ai_model_profiles_order_idx").on(table.providerId, table.priority, table.id),
]);

export const aiModelProfileCapabilities = pgTable("ai_model_profile_capabilities", {
  profileId: varchar("profile_id", {length: 64}).notNull().references(() => aiModelProfiles.id, {onDelete: "cascade"}), capability: varchar("capability", {length: 32}).notNull(),
}, (table) => [primaryKey({name: "ai_model_profile_capabilities_pkey", columns: [table.profileId, table.capability]}), check("ai_model_profile_capabilities_value_check", sql`${table.capability} in ('TEXT_GENERATION','TRANSLATION','STRUCTURED_OUTPUT','TOOL_CALLING')`), index("ai_model_profile_capabilities_lookup_idx").on(table.capability, table.profileId)]);

export const aiCredentialReferences = pgTable("ai_credential_references", {
  id: varchar("id", {length: 64}).primaryKey(), providerId: varchar("provider_id", {length: 64}).notNull().references(() => aiProviderConfigs.id), alias: varchar("alias", {length: 120}).notNull(),
  credentialReference: varchar("credential_reference", {length: 128}).notNull(), enabled: boolean("enabled").notNull(), priority: integer("priority").notNull(), version: integer("version").notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(), updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(), updatedBy: varchar("updated_by", {length: 160}).notNull(),
}, (table) => [
  check("ai_credential_references_id_check", sql`${table.id} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`), check("ai_credential_references_alias_check", sql`length(btrim(${table.alias})) between 1 and 120 and ${table.alias} !~ '[<>]'`),
  check("ai_credential_references_reference_check", sql`${table.credentialReference} ~ '^(?:[a-z][a-z0-9-]{1,63}|secret://[a-z][a-z0-9-]{1,31}(?:/[a-z0-9][a-z0-9-]{0,31}){1,4})$'`),
  check("ai_credential_references_priority_check", sql`${table.priority} between 0 and 1000000`), check("ai_credential_references_version_check", sql`${table.version} >= 1`),
  check("ai_credential_references_time_check", sql`${table.updatedAt} >= ${table.createdAt}`), check("ai_credential_references_actor_check", actorCheck(table.updatedBy)),
  uniqueIndex("ai_credential_references_provider_alias_idx").on(table.providerId, table.alias), index("ai_credential_references_order_idx").on(table.providerId, table.priority, table.id),
]);

export const aiProviderRegistryEvents = pgTable("ai_provider_registry_events", {
  id: varchar("id", {length: 128}).primaryKey(), entityType: varchar("entity_type", {length: 32}).notNull(), entityId: varchar("entity_id", {length: 64}).notNull(), changeType: varchar("change_type", {length: 16}).notNull(),
  previousVersion: integer("previous_version"), newVersion: integer("new_version").notNull(), actorReference: varchar("actor_reference", {length: 160}).notNull(),
  previousSnapshot: jsonb("previous_snapshot").$type<AiRegistryAuditSnapshot | null>(), newSnapshot: jsonb("new_snapshot").$type<AiRegistryAuditSnapshot>().notNull(), occurredAt: timestamp("occurred_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  check("ai_provider_registry_events_id_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`), check("ai_provider_registry_events_entity_type_check", sql`${table.entityType} in ('PROVIDER','MODEL_PROFILE','CREDENTIAL_REFERENCE')`),
  check("ai_provider_registry_events_change_type_check", sql`${table.changeType} in ('CREATED','UPDATED','ENABLED','DISABLED')`), check("ai_provider_registry_events_version_check", sql`${table.newVersion} >= 1 and (${table.previousVersion} is null or ${table.newVersion} = ${table.previousVersion} + 1)`),
  check("ai_provider_registry_events_creation_check", sql`(${table.changeType} = 'CREATED' and ${table.previousVersion} is null and ${table.previousSnapshot} is null) or (${table.changeType} <> 'CREATED' and ${table.previousVersion} is not null and ${table.previousSnapshot} is not null)`),
  check("ai_provider_registry_events_actor_check", actorCheck(table.actorReference)), index("ai_provider_registry_events_order_idx").on(table.occurredAt, table.id), index("ai_provider_registry_events_entity_idx").on(table.entityType, table.entityId),
]);

export const aiProviderRegistryPostgresSchema = {aiProviderConfigs, aiModelProfiles, aiModelProfileCapabilities, aiCredentialReferences, aiProviderRegistryEvents};
export type AiProviderRegistryDatabaseShape = AiProviderRegistryDto;
