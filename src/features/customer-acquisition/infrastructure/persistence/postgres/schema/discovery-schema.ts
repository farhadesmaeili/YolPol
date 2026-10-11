import {sql} from "drizzle-orm";
import {boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, timestamp, uniqueIndex, uuid, varchar} from "drizzle-orm/pg-core";
import type {DiscoveryState, DiscoveryWriteResult} from "@/features/customer-acquisition/domain/types/discovery-types";

const date = (name: string) => timestamp(name, {withTimezone: true, mode: "date"}).notNull();
export const discoveryPrincipalBindings = pgTable("acquisition_discovery_principal_bindings", {
  databaseRole: varchar("database_role", {length: 63}).primaryKey(), principalId: uuid("principal_id").notNull(),
  capability: varchar("capability", {length: 8}).notNull(), revoked: boolean("revoked").notNull().default(false),
  provisionedBy: varchar("provisioned_by", {length: 63}).notNull().default(sql`session_user`),
  createdAt: date("created_at").default(sql`clock_timestamp()`),
}, t => [uniqueIndex("discovery_binding_principal").on(t.principalId),
  check("discovery_binding_capability", sql`(${t.databaseRole} = 'discovery_intake' and ${t.capability} = 'INTAKE') or (${t.databaseRole} = 'discovery_reviewer' and ${t.capability} = 'REVIEW')`)]);

export const discoveryPolicies = pgTable("acquisition_discovery_policies", {
  key: varchar("key", {length: 64}).notNull(), version: varchar("version", {length: 128}).notNull(),
  fingerprint: varchar("fingerprint", {length: 64}).notNull(), snapshot: varchar("snapshot", {length: 4096}).notNull(),
  revoked: boolean("revoked").notNull().default(false),
  provisionedBy: varchar("provisioned_by", {length: 63}).notNull().default(sql`session_user`),
  createdAt: date("created_at").default(sql`clock_timestamp()`),
}, t => [primaryKey({columns: [t.key, t.version]}),
  check("discovery_policy_fingerprint", sql`${t.fingerprint} ~ '^[a-f0-9]{64}$'`)]);

export const discoveryBatches = pgTable("acquisition_discovery_batches", {
  id: uuid("id").primaryKey(), principalId: uuid("principal_id").notNull(), synthetic: boolean("synthetic").notNull(),
  policyKey: varchar("policy_key", {length: 64}).notNull(), policyVersion: varchar("policy_version", {length: 128}).notNull(),
  policyFingerprint: varchar("policy_fingerprint", {length: 64}).notNull(), policySnapshot: varchar("policy_snapshot", {length: 4096}).notNull(),
  sourceIdentity: varchar("source_identity", {length: 128}).notNull(), method: varchar("method", {length: 32}).notNull(),
  runReference: varchar("run_reference", {length: 128}).notNull(), count: integer("count").notNull(), createdAt: date("created_at"),
}, t => [check("discovery_batch_bounds", sql`${t.synthetic} and ${t.count} between 1 and 20 and ${t.method} = 'SYNTHETIC_FIXTURE' and ${t.policyFingerprint} ~ '^[a-f0-9]{64}$'`)]);

export const discoveryCandidates = pgTable("acquisition_discovery_candidates", {
  id: uuid("id").primaryKey(), batchId: uuid("batch_id").notNull().references(() => discoveryBatches.id), position: integer("position").notNull(),
  name: varchar("name", {length: 160}).notNull(), nameKey: varchar("name_key", {length: 160}).notNull(), country: varchar("country", {length: 2}).notNull(),
  domain: varchar("domain", {length: 253}).notNull(), sourceIdentity: varchar("source_identity", {length: 128}).notNull(), recordId: varchar("record_id", {length: 128}).notNull(),
  segment: varchar("segment", {length: 64}).notNull(), fingerprint: varchar("fingerprint", {length: 64}).notNull(),
  state: varchar("state", {length: 24}).$type<DiscoveryState>().notNull(), version: integer("version").notNull().default(0),
  createdAt: date("created_at"), expiresAt: date("expires_at"),
}, t => [uniqueIndex("discovery_batch_position").on(t.batchId, t.position),
  check("discovery_candidate_bounds", sql`${t.position} between 1 and 20 and length(trim(${t.name})) between 1 and 160 and length(trim(${t.nameKey})) between 1 and 160 and ${t.country} ~ '^[A-Z]{2}$' and ${t.version} >= 0 and ${t.fingerprint} ~ '^[a-f0-9]{64}$'`),
  check("discovery_candidate_domain", sql`${t.domain} = lower(${t.domain}) and ${t.domain} ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' and ${t.domain} not like '%..%' and (${t.domain} like '%.example' or ${t.domain} like '%.test' or ${t.domain} ~ '(^|[.])example[.](com|org|net)$')`),
  check("discovery_candidate_retention", sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.createdAt} + interval '7 days'`),
  check("discovery_candidate_state", sql`${t.state} in ('PENDING_REVIEW','NEEDS_EVIDENCE','IDENTITY_CONFLICT','APPROVED','REJECTED','SUPPRESSED','DUPLICATE')`),
  check("discovery_candidate_identifiers", sql`${t.recordId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' and ${t.sourceIdentity} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' and ${t.segment} ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'`),
  index("discovery_domain_lookup").on(t.domain), index("discovery_source_lookup").on(t.sourceIdentity, t.recordId), index("discovery_name_lookup").on(t.nameKey, t.country)]);

export const discoverySuppressionMarks = pgTable("acquisition_discovery_suppression_marks", {
  suppressionId: uuid("suppression_id").notNull(),
  event: varchar("event", {length: 8}).notNull(), domain: varchar("domain", {length: 254}).notNull(),
  observedAt: date("observed_at").default(sql`clock_timestamp()`),
}, t => [primaryKey({columns: [t.suppressionId, t.event]}), check("discovery_suppression_event", sql`${t.event} in ('ACTIVE','RELEASE')`)]);

export const discoveryEvidence = pgTable("acquisition_discovery_evidence", {
  id: uuid("id").primaryKey(), candidateId: uuid("candidate_id").notNull().references(() => discoveryCandidates.id),
  principalId: uuid("principal_id").notNull(), kind: varchar("kind", {length: 16}).notNull(), finding: varchar("finding", {length: 16}).notNull(),
  url: varchar("url", {length: 1024}).notNull(), reference: varchar("reference", {length: 128}).notNull(),
  observedAt: date("observed_at"), createdAt: date("created_at"),
}, t => [check("discovery_evidence_kind", sql`${t.kind} in ('SOURCE','WEBSITE','SEGMENT','PACKAGING') and ${t.finding} in ('OBSERVED','SUPPORTS','CONTRADICTS') and ((${t.kind} = 'SOURCE') = (${t.finding} = 'OBSERVED'))`),
  check("discovery_evidence_reference", sql`${t.reference} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' and ${t.observedAt} <= ${t.createdAt}`),
  check("discovery_evidence_url", sql`${t.url} ~ '^https://([a-z0-9-]+[.])+(example|test)/[^?#[:space:]]*$|^https://([a-z0-9-]+[.])*example[.](com|org|net)/[^?#[:space:]]*$'`),
  uniqueIndex("discovery_source_evidence").on(t.candidateId).where(sql`${t.kind} = 'SOURCE'`)]);

export const discoveryMatches = pgTable("acquisition_discovery_identity_matches", {
  id: uuid("id").primaryKey(), candidateId: uuid("candidate_id").notNull().references(() => discoveryCandidates.id),
  otherCandidateId: uuid("other_candidate_id").notNull().references(() => discoveryCandidates.id), kind: varchar("kind", {length: 24}).notNull(), createdAt: date("created_at"),
}, t => [uniqueIndex("discovery_match_pair").on(t.candidateId, t.otherCandidateId), uniqueIndex("discovery_match_owner").on(t.id, t.candidateId),
  check("discovery_match_kind", sql`${t.candidateId} <> ${t.otherCandidateId} and ${t.kind} in ('EXACT_DUPLICATE','STRONG_CONFLICT','POSSIBLE_NAME_MATCH')`)]);

export const discoveryReviews = pgTable("acquisition_discovery_reviews", {
  id: uuid("id").primaryKey(), candidateId: uuid("candidate_id").notNull().references(() => discoveryCandidates.id), reviewerId: uuid("reviewer_id").notNull(),
  decision: varchar("decision", {length: 24}).notNull(), reason: varchar("reason", {length: 32}).notNull(), findingId: uuid("finding_id"),
  version: integer("version").notNull(), state: varchar("state", {length: 24}).$type<DiscoveryState>().notNull(), createdAt: date("created_at"),
}, t => [uniqueIndex("discovery_review_version").on(t.candidateId, t.version),
  foreignKey({name: "discovery_review_finding_owner", columns: [t.findingId, t.candidateId], foreignColumns: [discoveryMatches.id, discoveryMatches.candidateId]}),
  check("discovery_review_decision", sql`${t.version} > 0 and ${t.decision} in ('APPROVE','REJECT','SUPPRESS','DUPLICATE','NEEDS_EVIDENCE','RESOLVE_DISTINCT') and (${t.findingId} is not null) = (${t.decision} in ('DUPLICATE','RESOLVE_DISTINCT'))`),
  check("discovery_review_reason", sql`${t.reason} in ('EVIDENCE_REVIEWED','INSUFFICIENT_EVIDENCE','IDENTITY_REVIEWED','MANUAL_SUPPRESSION')`)]);

export const discoveryOperations = pgTable("acquisition_discovery_operations", {
  principalId: uuid("principal_id").notNull(), key: varchar("key", {length: 128}).notNull(), kind: varchar("kind", {length: 16}).notNull(),
  fingerprint: varchar("fingerprint", {length: 64}).notNull(), result: jsonb("result").$type<DiscoveryWriteResult>().notNull(), createdAt: date("created_at"),
}, t => [primaryKey({columns: [t.principalId, t.key, t.kind]}),
  check("discovery_operation_bounds", sql`${t.kind} in ('BATCH','EVIDENCE','REVIEW') and ${t.key} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' and ${t.fingerprint} ~ '^[a-f0-9]{64}$' and jsonb_typeof(${t.result}) = 'object' and octet_length(${t.result}::text) <= 2048`)]);
