CREATE TABLE "acquisition_qualification_assessments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"policy_version" varchar(32) NOT NULL,
	"market_match" boolean NOT NULL,
	"segment_match" boolean NOT NULL,
	"packaging_relevance" boolean NOT NULL,
	"score" integer NOT NULL,
	"decision" varchar(24) NOT NULL,
	"reasons" varchar(32)[] NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_assessment_score" CHECK ("acquisition_qualification_assessments"."score" between 0 and 100),
	CONSTRAINT "acquisition_assessment_policy" CHECK ("acquisition_qualification_assessments"."policy_version" = 'foundation-v1'),
	CONSTRAINT "acquisition_assessment_decision" CHECK ("acquisition_qualification_assessments"."decision" in ('REVIEW_REQUIRED','FOUNDATION_FIT','BLOCKED')),
	CONSTRAINT "acquisition_assessment_reasons" CHECK (cardinality("acquisition_qualification_assessments"."reasons") between 1 and 4 and "acquisition_qualification_assessments"."reasons" <@ array['MARKET_MATCH','SEGMENT_MATCH','PACKAGING_RELEVANCE','SUPPRESSION_PRESENT','INSUFFICIENT_EVIDENCE']::varchar[])
);
--> statement-breakpoint
CREATE TABLE "acquisition_companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"name_key" varchar(160) NOT NULL,
	"country" varchar(2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_company_name" CHECK (length(trim("acquisition_companies"."name")) between 1 and 160 and length(trim("acquisition_companies"."name_key")) between 1 and 160),
	CONSTRAINT "acquisition_company_country" CHECK ("acquisition_companies"."country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "acquisition_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"original_email" varchar(254) NOT NULL,
	"normalized_email" varchar(254) NOT NULL,
	"verification" varchar(16) DEFAULT 'UNVERIFIED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_contact_name" CHECK (length(trim("acquisition_contacts"."name")) between 1 and 160),
	CONSTRAINT "acquisition_contact_email_format" CHECK ("acquisition_contacts"."normalized_email" ~ '^[^[:space:]@]+@[^[:space:]@]+$' and split_part("acquisition_contacts"."normalized_email", '@', 2) = lower(split_part("acquisition_contacts"."normalized_email", '@', 2))),
	CONSTRAINT "acquisition_contact_verification" CHECK ("acquisition_contacts"."verification" = 'UNVERIFIED')
);
--> statement-breakpoint
CREATE TABLE "acquisition_company_domains" (
	"domain" varchar(253) PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"is_primary" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_domain_format" CHECK ("acquisition_company_domains"."domain" = lower("acquisition_company_domains"."domain") and "acquisition_company_domains"."domain" ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' and "acquisition_company_domains"."domain" not like '%..%')
);
--> statement-breakpoint
CREATE TABLE "acquisition_leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"segment" varchar(64) NOT NULL,
	"state" varchar(24) DEFAULT 'NEW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_segment" CHECK ("acquisition_leads"."segment" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
	CONSTRAINT "acquisition_lead_state" CHECK ("acquisition_leads"."state" in ('NEW','REVIEW_REQUIRED','ASSESSED'))
);
--> statement-breakpoint
CREATE TABLE "acquisition_source_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"system" varchar(64) NOT NULL,
	"record_id" varchar(128),
	"url" varchar(1024),
	"observed_at" timestamp with time zone NOT NULL,
	"run_reference" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"outcome" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_observation_target" CHECK (("acquisition_source_observations"."outcome" = 'ACCEPTED' and num_nonnulls("acquisition_source_observations"."company_id", "acquisition_source_observations"."contact_id") = 1) or ("acquisition_source_observations"."outcome" = 'REVIEW_REQUIRED' and num_nonnulls("acquisition_source_observations"."company_id", "acquisition_source_observations"."contact_id") = 0)),
	CONSTRAINT "acquisition_observation_fingerprint" CHECK ("acquisition_source_observations"."fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "acquisition_observation_source" CHECK ("acquisition_source_observations"."system" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' and "acquisition_source_observations"."run_reference" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
CREATE TABLE "acquisition_operations" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_operation_key" CHECK ("acquisition_operations"."key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "acquisition_operation_kind" CHECK ("acquisition_operations"."kind" in ('INGEST','QUALIFY','SUPPRESS','RELEASE')),
	CONSTRAINT "acquisition_operation_fingerprint" CHECK ("acquisition_operations"."fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "acquisition_operation_result" CHECK (jsonb_typeof("acquisition_operations"."result") = 'object' and octet_length("acquisition_operations"."result"::text) <= 2048)
);
--> statement-breakpoint
CREATE TABLE "acquisition_source_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"system" varchar(64) NOT NULL,
	"record_id" varchar(128) NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquisition_source_identity_format" CHECK ("acquisition_source_identities"."system" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' and "acquisition_source_identities"."record_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
CREATE TABLE "acquisition_suppression_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(8) NOT NULL,
	"target" varchar(254) NOT NULL,
	"reason" varchar(24) NOT NULL,
	"source_reference" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "acquisition_suppression_kind" CHECK ("acquisition_suppression_entries"."kind" in ('DOMAIN','EMAIL')),
	CONSTRAINT "acquisition_suppression_target" CHECK (length(trim("acquisition_suppression_entries"."target")) between 3 and 254 and ("acquisition_suppression_entries"."kind" <> 'DOMAIN' or ("acquisition_suppression_entries"."target" = lower("acquisition_suppression_entries"."target") and "acquisition_suppression_entries"."target" not like '%@%')) and ("acquisition_suppression_entries"."kind" <> 'EMAIL' or "acquisition_suppression_entries"."target" ~ '^[^[:space:]@]+@[^[:space:]@]+$')),
	CONSTRAINT "acquisition_suppression_reason" CHECK ("acquisition_suppression_entries"."reason" in ('TEST_OPT_OUT','MANUAL_REVIEW')),
	CONSTRAINT "acquisition_suppression_release" CHECK ("acquisition_suppression_entries"."released_at" is null or "acquisition_suppression_entries"."released_at" >= "acquisition_suppression_entries"."created_at")
);
--> statement-breakpoint
ALTER TABLE "acquisition_qualification_assessments" ADD CONSTRAINT "acquisition_qualification_assessments_lead_id_acquisition_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."acquisition_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_contacts" ADD CONSTRAINT "acquisition_contacts_company_id_acquisition_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."acquisition_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_company_domains" ADD CONSTRAINT "acquisition_company_domains_company_id_acquisition_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."acquisition_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_leads" ADD CONSTRAINT "acquisition_leads_company_id_acquisition_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."acquisition_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_source_observations" ADD CONSTRAINT "acquisition_source_observations_company_id_acquisition_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."acquisition_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_source_observations" ADD CONSTRAINT "acquisition_source_observations_contact_id_acquisition_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."acquisition_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_source_identities" ADD CONSTRAINT "acquisition_source_identities_company_id_acquisition_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."acquisition_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_assessment_idempotency" ON "acquisition_qualification_assessments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "acquisition_assessment_history" ON "acquisition_qualification_assessments" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "acquisition_company_possible_match" ON "acquisition_companies" USING btree ("name_key","country");--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_contact_email" ON "acquisition_contacts" USING btree ("normalized_email");--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_contact_company" ON "acquisition_contacts" USING btree ("id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_primary_domain" ON "acquisition_company_domains" USING btree ("company_id") WHERE "acquisition_company_domains"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_company_segment" ON "acquisition_leads" USING btree ("company_id","segment");--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_observation_idempotency" ON "acquisition_source_observations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "acquisition_observation_history" ON "acquisition_source_observations" USING btree ("company_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_source_identity" ON "acquisition_source_identities" USING btree ("system","record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "acquisition_active_suppression" ON "acquisition_suppression_entries" USING btree ("kind","target") WHERE "acquisition_suppression_entries"."released_at" is null;--> statement-breakpoint
-- Explicit privileges are part of this migration, not broad default grants.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;--> statement-breakpoint
GRANT SELECT, INSERT ON acquisition_companies, acquisition_company_domains, acquisition_contacts,
  acquisition_leads, acquisition_source_identities, acquisition_source_observations,
  acquisition_qualification_assessments, acquisition_suppression_entries, acquisition_operations TO acquisition_runtime;--> statement-breakpoint
GRANT UPDATE (state) ON acquisition_leads TO acquisition_runtime;--> statement-breakpoint
GRANT UPDATE (released_at) ON acquisition_suppression_entries TO acquisition_runtime;--> statement-breakpoint
CREATE FUNCTION acquisition_release_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
    RAISE EXCEPTION 'Suppression release is irreversible';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER acquisition_suppression_release_once BEFORE UPDATE ON acquisition_suppression_entries
  FOR EACH ROW EXECUTE FUNCTION acquisition_release_once();
