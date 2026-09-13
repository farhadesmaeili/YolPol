import {sql} from "drizzle-orm";
import {check, index, integer, pgTable, primaryKey, timestamp, varchar} from "drizzle-orm/pg-core";

import {aiCredentialReferences, aiModelProfiles, aiProviderConfigs} from "@/features/ai-provider-registry/infrastructure/persistence/postgres/schema/ai-provider-registry-schema";

export const aiProviderRuntimeHealth = pgTable("ai_provider_runtime_health", {
  providerConfigurationId: varchar("provider_configuration_id", {length: 64}).notNull().references(() => aiProviderConfigs.id),
  modelProfileId: varchar("model_profile_id", {length: 64}).notNull().references(() => aiModelProfiles.id),
  credentialReferenceId: varchar("credential_reference_id", {length: 64}).notNull().references(() => aiCredentialReferences.id),
  state: varchar("state", {length: 16}).notNull(),
  consecutiveFailures: integer("consecutive_failures").notNull(),
  lastSuccessAt: timestamp("last_success_at", {withTimezone: true, mode: "date"}),
  lastFailureAt: timestamp("last_failure_at", {withTimezone: true, mode: "date"}),
  openedAt: timestamp("opened_at", {withTimezone: true, mode: "date"}),
  openUntil: timestamp("open_until", {withTimezone: true, mode: "date"}),
  halfOpenLeaseUntil: timestamp("half_open_lease_until", {withTimezone: true, mode: "date"}),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
  version: integer("version").notNull(),
}, (table) => [
  primaryKey({name: "ai_provider_runtime_health_pkey", columns: [table.providerConfigurationId, table.modelProfileId, table.credentialReferenceId]}),
  check("ai_provider_runtime_health_state_check", sql`${table.state} in ('CLOSED','OPEN','HALF_OPEN')`),
  check("ai_provider_runtime_health_failures_check", sql`${table.consecutiveFailures} between 0 and 1000000`),
  check("ai_provider_runtime_health_version_check", sql`${table.version} >= 1`),
  check("ai_provider_runtime_health_state_metadata_check", sql`
    (${table.state} = 'CLOSED' and ${table.openUntil} is null and ${table.halfOpenLeaseUntil} is null)
    or (${table.state} = 'OPEN' and ${table.openUntil} is not null and ${table.halfOpenLeaseUntil} is null)
    or (${table.state} = 'HALF_OPEN' and ${table.openUntil} is not null and ${table.halfOpenLeaseUntil} is not null)
  `),
  index("ai_provider_runtime_health_open_idx").on(table.state, table.openUntil),
  index("ai_provider_runtime_health_updated_idx").on(table.updatedAt),
]);

export const aiProviderGatewayPostgresSchema = {aiProviderRuntimeHealth};
