import {sql} from "drizzle-orm";
import {boolean, check, index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar} from "drizzle-orm/pg-core";
import type {AcquisitionResult} from "@/features/customer-acquisition/domain/types/acquisition-types";

const createdAt = () => timestamp("created_at", {withTimezone: true, mode: "date"}).notNull().defaultNow();

export const companies = pgTable("acquisition_companies", {
  id: uuid("id").primaryKey(), name: varchar("name", {length: 160}).notNull(),
  nameKey: varchar("name_key", {length: 160}).notNull(), country: varchar("country", {length: 2}).notNull(), createdAt: createdAt(),
}, (t) => [check("acquisition_company_name", sql`length(trim(${t.name})) between 1 and 160 and length(trim(${t.nameKey})) between 1 and 160`),
  check("acquisition_company_country", sql`${t.country} ~ '^[A-Z]{2}$'`), index("acquisition_company_possible_match").on(t.nameKey, t.country)]);

export const domains = pgTable("acquisition_company_domains", {
  domain: varchar("domain", {length: 253}).primaryKey(), companyId: uuid("company_id").notNull().references(() => companies.id),
  primary: boolean("is_primary").notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex("acquisition_primary_domain").on(t.companyId).where(sql`${t.primary}`),
  check("acquisition_domain_format", sql`${t.domain} = lower(${t.domain}) and ${t.domain} ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' and ${t.domain} not like '%..%'`)]);

export const contacts = pgTable("acquisition_contacts", {
  id: uuid("id").primaryKey(), companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", {length: 160}).notNull(), originalEmail: varchar("original_email", {length: 254}).notNull(),
  normalizedEmail: varchar("normalized_email", {length: 254}).notNull(),
  verification: varchar("verification", {length: 16}).notNull().default("UNVERIFIED"), createdAt: createdAt(),
}, (t) => [uniqueIndex("acquisition_contact_email").on(t.normalizedEmail), uniqueIndex("acquisition_contact_company").on(t.id, t.companyId),
  check("acquisition_contact_name", sql`length(trim(${t.name})) between 1 and 160`),
  check("acquisition_contact_email_format", sql`${t.normalizedEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+$' and split_part(${t.normalizedEmail}, '@', 2) = lower(split_part(${t.normalizedEmail}, '@', 2))`),
  check("acquisition_contact_verification", sql`${t.verification} = 'UNVERIFIED'`)]);

export const leads = pgTable("acquisition_leads", {
  id: uuid("id").primaryKey(), companyId: uuid("company_id").notNull().references(() => companies.id),
  segment: varchar("segment", {length: 64}).notNull(), state: varchar("state", {length: 24}).notNull().default("NEW"), createdAt: createdAt(),
}, (t) => [uniqueIndex("acquisition_company_segment").on(t.companyId, t.segment),
  check("acquisition_segment", sql`${t.segment} ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'`),
  check("acquisition_lead_state", sql`${t.state} in ('NEW','REVIEW_REQUIRED','ASSESSED')`)]);

// Stable source identity is separate from append-only observations of that identity.
export const sourceIdentities = pgTable("acquisition_source_identities", {
  id: uuid("id").primaryKey(), system: varchar("system", {length: 64}).notNull(), recordId: varchar("record_id", {length: 128}).notNull(),
  companyId: uuid("company_id").notNull().references(() => companies.id), createdAt: createdAt(),
}, (t) => [uniqueIndex("acquisition_source_identity").on(t.system, t.recordId),
  check("acquisition_source_identity_format", sql`${t.system} ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' and ${t.recordId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'`)]);

export const observations = pgTable("acquisition_source_observations", {
  id: uuid("id").primaryKey(), companyId: uuid("company_id").references(() => companies.id), contactId: uuid("contact_id").references(() => contacts.id),
  system: varchar("system", {length: 64}).notNull(), recordId: varchar("record_id", {length: 128}), url: varchar("url", {length: 1024}),
  observedAt: timestamp("observed_at", {withTimezone: true, mode: "date"}).notNull(), runReference: varchar("run_reference", {length: 128}).notNull(),
  idempotencyKey: varchar("idempotency_key", {length: 128}).notNull(), fingerprint: varchar("fingerprint", {length: 64}).notNull(),
  outcome: varchar("outcome", {length: 24}).notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex("acquisition_observation_idempotency").on(t.idempotencyKey),
  check("acquisition_observation_target", sql`(${t.outcome} = 'ACCEPTED' and num_nonnulls(${t.companyId}, ${t.contactId}) = 1) or (${t.outcome} = 'REVIEW_REQUIRED' and num_nonnulls(${t.companyId}, ${t.contactId}) = 0)`),
  check("acquisition_observation_fingerprint", sql`${t.fingerprint} ~ '^[a-f0-9]{64}$'`),
  check("acquisition_observation_source", sql`${t.system} ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' and ${t.runReference} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'`),
  index("acquisition_observation_history").on(t.companyId, t.observedAt)]);

export const assessments = pgTable("acquisition_qualification_assessments", {
  id: uuid("id").primaryKey(), leadId: uuid("lead_id").notNull().references(() => leads.id),
  policyVersion: varchar("policy_version", {length: 32}).notNull(),
  marketMatch: boolean("market_match").notNull(), segmentMatch: boolean("segment_match").notNull(), packagingRelevance: boolean("packaging_relevance").notNull(),
  score: integer("score").notNull(), decision: varchar("decision", {length: 24}).notNull(),
  reasons: varchar("reasons", {length: 32}).array().notNull(), idempotencyKey: varchar("idempotency_key", {length: 128}).notNull(), createdAt: createdAt(),
}, (t) => [uniqueIndex("acquisition_assessment_idempotency").on(t.idempotencyKey),
  check("acquisition_assessment_score", sql`${t.score} between 0 and 100`),
  check("acquisition_assessment_policy", sql`${t.policyVersion} = 'foundation-v1'`),
  check("acquisition_assessment_decision", sql`${t.decision} in ('REVIEW_REQUIRED','FOUNDATION_FIT','BLOCKED')`),
  check("acquisition_assessment_reasons", sql`cardinality(${t.reasons}) between 1 and 4 and ${t.reasons} <@ array['MARKET_MATCH','SEGMENT_MATCH','PACKAGING_RELEVANCE','SUPPRESSION_PRESENT','INSUFFICIENT_EVIDENCE']::varchar[]`),
  index("acquisition_assessment_history").on(t.leadId, t.createdAt)]);

export const suppressions = pgTable("acquisition_suppression_entries", {
  id: uuid("id").primaryKey(), kind: varchar("kind", {length: 8}).notNull(), target: varchar("target", {length: 254}).notNull(),
  reason: varchar("reason", {length: 24}).notNull(), sourceReference: varchar("source_reference", {length: 128}).notNull(),
  createdAt: createdAt(), releasedAt: timestamp("released_at", {withTimezone: true, mode: "date"}),
}, (t) => [uniqueIndex("acquisition_active_suppression").on(t.kind, t.target).where(sql`${t.releasedAt} is null`),
  check("acquisition_suppression_kind", sql`${t.kind} in ('DOMAIN','EMAIL')`),
  check("acquisition_suppression_target", sql`length(trim(${t.target})) between 3 and 254 and (${t.kind} <> 'DOMAIN' or (${t.target} = lower(${t.target}) and ${t.target} not like '%@%')) and (${t.kind} <> 'EMAIL' or ${t.target} ~ '^[^[:space:]@]+@[^[:space:]@]+$')`),
  check("acquisition_suppression_reason", sql`${t.reason} in ('TEST_OPT_OUT','MANUAL_REVIEW')`),
  check("acquisition_suppression_release", sql`${t.releasedAt} is null or ${t.releasedAt} >= ${t.createdAt}`)]);

// This ledger stores only safe operation results and a canonical request hash, never credentials or raw payloads.
export const operations = pgTable("acquisition_operations", {
  key: varchar("key", {length: 128}).primaryKey(), kind: varchar("kind", {length: 16}).notNull(),
  fingerprint: varchar("fingerprint", {length: 64}).notNull(), result: jsonb("result").$type<AcquisitionResult>().notNull(), createdAt: createdAt(),
}, (t) => [check("acquisition_operation_key", sql`${t.key} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'`),
  check("acquisition_operation_kind", sql`${t.kind} in ('INGEST','QUALIFY','SUPPRESS','RELEASE')`),
  check("acquisition_operation_fingerprint", sql`${t.fingerprint} ~ '^[a-f0-9]{64}$'`),
  check("acquisition_operation_result", sql`jsonb_typeof(${t.result}) = 'object' and octet_length(${t.result}::text) <= 2048`)]);

export const acquisitionSchema = {companies, domains, contacts, leads, sourceIdentities, observations, assessments, suppressions, operations};
