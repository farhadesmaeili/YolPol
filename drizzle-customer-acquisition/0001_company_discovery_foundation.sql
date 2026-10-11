-- Discovery roles must be separately provisioned by an administrator. This migration
-- never creates login credentials. The validation overlay provisions disposable roles.
CREATE TABLE "acquisition_discovery_principal_bindings" (
  "database_role" varchar(63) PRIMARY KEY NOT NULL,
  "principal_id" uuid NOT NULL,
  "capability" varchar(8) NOT NULL,
  "revoked" boolean DEFAULT false NOT NULL,
  "provisioned_by" varchar(63) DEFAULT session_user NOT NULL,
  "created_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT "discovery_binding_capability" CHECK (("database_role" = 'discovery_intake' AND "capability" = 'INTAKE') OR ("database_role" = 'discovery_reviewer' AND "capability" = 'REVIEW'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_binding_principal" ON "acquisition_discovery_principal_bindings" ("principal_id");
--> statement-breakpoint
CREATE TABLE "acquisition_discovery_policies" (
  "key" varchar(64) NOT NULL,
  "version" varchar(128) NOT NULL,
  "fingerprint" varchar(64) NOT NULL,
  "snapshot" varchar(4096) NOT NULL,
  "revoked" boolean DEFAULT false NOT NULL,
  "provisioned_by" varchar(63) DEFAULT session_user NOT NULL,
  "created_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT "acquisition_discovery_policies_key_version_pk" PRIMARY KEY ("key", "version"),
  CONSTRAINT "discovery_policy_fingerprint" CHECK ("fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "acquisition_discovery_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"principal_id" uuid NOT NULL,
	"synthetic" boolean NOT NULL,
	"policy_key" varchar(64) NOT NULL,
	"policy_version" varchar(128) NOT NULL,
	"policy_fingerprint" varchar(64) NOT NULL,
	"policy_snapshot" varchar(4096) NOT NULL,
	"source_identity" varchar(128) NOT NULL,
	"method" varchar(32) NOT NULL,
	"run_reference" varchar(128) NOT NULL,
	"count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discovery_batch_bounds" CHECK ("acquisition_discovery_batches"."synthetic" and "acquisition_discovery_batches"."count" between 1 and 20 and "acquisition_discovery_batches"."method" = 'SYNTHETIC_FIXTURE' and "acquisition_discovery_batches"."policy_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "acquisition_discovery_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"name_key" varchar(160) NOT NULL,
	"country" varchar(2) NOT NULL,
	"domain" varchar(253) NOT NULL,
	"source_identity" varchar(128) NOT NULL,
	"record_id" varchar(128) NOT NULL,
	"segment" varchar(64) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"state" varchar(24) NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discovery_candidate_bounds" CHECK ("acquisition_discovery_candidates"."position" between 1 and 20 and length(trim("acquisition_discovery_candidates"."name")) between 1 and 160 and length(trim("acquisition_discovery_candidates"."name_key")) between 1 and 160 and "acquisition_discovery_candidates"."country" ~ '^[A-Z]{2}$' and "acquisition_discovery_candidates"."version" >= 0 and "acquisition_discovery_candidates"."fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "discovery_candidate_domain" CHECK ("acquisition_discovery_candidates"."domain" = lower("acquisition_discovery_candidates"."domain") and "acquisition_discovery_candidates"."domain" ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' and "acquisition_discovery_candidates"."domain" not like '%..%' and ("acquisition_discovery_candidates"."domain" like '%.example' or "acquisition_discovery_candidates"."domain" like '%.test' or "acquisition_discovery_candidates"."domain" ~ '(^|[.])example[.](com|org|net)$')),
	CONSTRAINT "discovery_candidate_retention" CHECK ("acquisition_discovery_candidates"."expires_at" > "acquisition_discovery_candidates"."created_at" and "acquisition_discovery_candidates"."expires_at" <= "acquisition_discovery_candidates"."created_at" + interval '7 days'),
	CONSTRAINT "discovery_candidate_state" CHECK ("acquisition_discovery_candidates"."state" in ('PENDING_REVIEW','NEEDS_EVIDENCE','IDENTITY_CONFLICT','APPROVED','REJECTED','SUPPRESSED','DUPLICATE')),
	CONSTRAINT "discovery_candidate_identifiers" CHECK ("acquisition_discovery_candidates"."record_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' and "acquisition_discovery_candidates"."source_identity" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' and "acquisition_discovery_candidates"."segment" ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "acquisition_discovery_suppression_marks" (
  "suppression_id" uuid NOT NULL,
  "event" varchar(8) NOT NULL,
  "domain" varchar(254) NOT NULL,
  "observed_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT "acquisition_discovery_suppression_marks_suppression_id_event_pk" PRIMARY KEY ("suppression_id","event"),
  CONSTRAINT "discovery_suppression_event" CHECK ("event" in ('ACTIVE','RELEASE'))
);
--> statement-breakpoint
CREATE TABLE "acquisition_discovery_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"candidate_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"finding" varchar(16) NOT NULL,
	"url" varchar(1024) NOT NULL,
	"reference" varchar(128) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discovery_evidence_kind" CHECK ("acquisition_discovery_evidence"."kind" in ('SOURCE','WEBSITE','SEGMENT','PACKAGING') and "acquisition_discovery_evidence"."finding" in ('OBSERVED','SUPPORTS','CONTRADICTS') and (("acquisition_discovery_evidence"."kind" = 'SOURCE') = ("acquisition_discovery_evidence"."finding" = 'OBSERVED'))),
	CONSTRAINT "discovery_evidence_reference" CHECK ("acquisition_discovery_evidence"."reference" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' and "acquisition_discovery_evidence"."observed_at" <= "acquisition_discovery_evidence"."created_at"),
	CONSTRAINT "discovery_evidence_url" CHECK ("acquisition_discovery_evidence"."url" ~ '^https://([a-z0-9-]+[.])+(example|test)/[^?#[:space:]]*$|^https://([a-z0-9-]+[.])*example[.](com|org|net)/[^?#[:space:]]*$')
);
--> statement-breakpoint
CREATE TABLE "acquisition_discovery_identity_matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"candidate_id" uuid NOT NULL,
	"other_candidate_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discovery_match_kind" CHECK ("acquisition_discovery_identity_matches"."candidate_id" <> "acquisition_discovery_identity_matches"."other_candidate_id" and "acquisition_discovery_identity_matches"."kind" in ('EXACT_DUPLICATE','STRONG_CONFLICT','POSSIBLE_NAME_MATCH'))
);
--> statement-breakpoint
CREATE TABLE "acquisition_discovery_operations" (
	"principal_id" uuid NOT NULL,
	"key" varchar(128) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "acquisition_discovery_operations_principal_id_key_kind_pk" PRIMARY KEY("principal_id","key","kind"),
	CONSTRAINT "discovery_operation_bounds" CHECK ("acquisition_discovery_operations"."kind" in ('BATCH','EVIDENCE','REVIEW') and "acquisition_discovery_operations"."key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' and "acquisition_discovery_operations"."fingerprint" ~ '^[a-f0-9]{64}$' and jsonb_typeof("acquisition_discovery_operations"."result") = 'object' and octet_length("acquisition_discovery_operations"."result"::text) <= 2048)
);
--> statement-breakpoint
CREATE TABLE "acquisition_discovery_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"candidate_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" varchar(24) NOT NULL,
	"reason" varchar(32) NOT NULL,
	"finding_id" uuid,
	"version" integer NOT NULL,
	"state" varchar(24) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "discovery_review_decision" CHECK ("acquisition_discovery_reviews"."version" > 0 and "acquisition_discovery_reviews"."decision" in ('APPROVE','REJECT','SUPPRESS','DUPLICATE','NEEDS_EVIDENCE','RESOLVE_DISTINCT') and ("acquisition_discovery_reviews"."finding_id" is not null) = ("acquisition_discovery_reviews"."decision" in ('DUPLICATE','RESOLVE_DISTINCT'))),
	CONSTRAINT "discovery_review_reason" CHECK ("acquisition_discovery_reviews"."reason" in ('EVIDENCE_REVIEWED','INSUFFICIENT_EVIDENCE','IDENTITY_REVIEWED','MANUAL_SUPPRESSION'))
);
--> statement-breakpoint
ALTER TABLE "acquisition_discovery_candidates" ADD CONSTRAINT "acquisition_discovery_candidates_batch_id_acquisition_discovery_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."acquisition_discovery_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_discovery_evidence" ADD CONSTRAINT "acquisition_discovery_evidence_candidate_id_acquisition_discovery_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."acquisition_discovery_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_discovery_identity_matches" ADD CONSTRAINT "acquisition_discovery_identity_matches_candidate_id_acquisition_discovery_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."acquisition_discovery_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_discovery_identity_matches" ADD CONSTRAINT "acquisition_discovery_identity_matches_other_candidate_id_acquisition_discovery_candidates_id_fk" FOREIGN KEY ("other_candidate_id") REFERENCES "public"."acquisition_discovery_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquisition_discovery_reviews" ADD CONSTRAINT "acquisition_discovery_reviews_candidate_id_acquisition_discovery_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."acquisition_discovery_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_match_owner" ON "acquisition_discovery_identity_matches" USING btree ("id","candidate_id");--> statement-breakpoint
ALTER TABLE "acquisition_discovery_reviews" ADD CONSTRAINT "discovery_review_finding_owner" FOREIGN KEY ("finding_id","candidate_id") REFERENCES "public"."acquisition_discovery_identity_matches"("id","candidate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_batch_position" ON "acquisition_discovery_candidates" USING btree ("batch_id","position");--> statement-breakpoint
CREATE INDEX "discovery_domain_lookup" ON "acquisition_discovery_candidates" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "discovery_source_lookup" ON "acquisition_discovery_candidates" USING btree ("source_identity","record_id");--> statement-breakpoint
CREATE INDEX "discovery_name_lookup" ON "acquisition_discovery_candidates" USING btree ("name_key","country");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_source_evidence" ON "acquisition_discovery_evidence" USING btree ("candidate_id") WHERE "acquisition_discovery_evidence"."kind" = 'SOURCE';--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_match_pair" ON "acquisition_discovery_identity_matches" USING btree ("candidate_id","other_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_review_version" ON "acquisition_discovery_reviews" USING btree ("candidate_id","version");
--> statement-breakpoint
-- Runtime may append history, but cannot change facts, deadlines or audit records.
REVOKE ALL ON public.acquisition_discovery_batches, public.acquisition_discovery_candidates,
  public.acquisition_discovery_evidence, public.acquisition_discovery_identity_matches,
  public.acquisition_discovery_reviews, public.acquisition_discovery_operations FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.acquisition_discovery_batches, public.acquisition_discovery_candidates,
  public.acquisition_discovery_evidence, public.acquisition_discovery_identity_matches,
  public.acquisition_discovery_reviews, public.acquisition_discovery_operations TO discovery_mutation_owner;
--> statement-breakpoint
GRANT UPDATE (state, version) ON public.acquisition_discovery_candidates TO discovery_mutation_owner;
--> statement-breakpoint
GRANT SELECT ON public.acquisition_suppression_entries TO discovery_mutation_owner;
REVOKE ALL ON public.acquisition_discovery_suppression_marks FROM PUBLIC;
GRANT SELECT, INSERT ON public.acquisition_discovery_suppression_marks TO discovery_mutation_owner;
--> statement-breakpoint
REVOKE ALL ON public.acquisition_discovery_principal_bindings, public.acquisition_discovery_policies FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT ON public.acquisition_discovery_principal_bindings, public.acquisition_discovery_policies TO discovery_mutation_owner;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.acquisition_discovery_principal_bindings, public.acquisition_discovery_policies TO discovery_provisioner;
--> statement-breakpoint
GRANT UPDATE (revoked) ON public.acquisition_discovery_principal_bindings, public.acquisition_discovery_policies TO discovery_provisioner;
--> statement-breakpoint
CREATE FUNCTION acquisition_discovery_candidate_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE b public.acquisition_discovery_batches; r public.acquisition_discovery_reviews;
BEGIN
  PERFORM pg_advisory_xact_lock(820082);
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO STRICT b FROM public.acquisition_discovery_batches WHERE id = NEW.batch_id;
    IF NEW.version <> 0 OR NEW.state NOT IN ('PENDING_REVIEW','IDENTITY_CONFLICT','SUPPRESSED')
      OR NEW.position > b.count OR NEW.source_identity <> b.source_identity
      OR NEW.created_at <> b.created_at OR NEW.created_at > clock_timestamp()
      OR NEW.expires_at <= clock_timestamp() OR NEW.expires_at > clock_timestamp() + interval '7 days'
      OR NEW.expires_at > (b.policy_snapshot::jsonb->>'expiresAt')::timestamptz THEN
      RAISE EXCEPTION 'Discovery candidate rejected';
    END IF;
    IF EXISTS (SELECT 1 FROM public.acquisition_discovery_candidates c WHERE
      (c.domain = NEW.domain OR (c.source_identity = NEW.source_identity AND c.record_id = NEW.record_id))
      AND (NEW.expires_at > c.expires_at OR NEW.state = 'PENDING_REVIEW')) THEN
      RAISE EXCEPTION 'Discovery identity requires review';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - 'state' - 'version') <> (to_jsonb(OLD) - 'state' - 'version')
      OR NEW.version <> OLD.version + 1 OR OLD.expires_at <= clock_timestamp()
      OR OLD.state IN ('REJECTED','SUPPRESSED','DUPLICATE')
      OR (OLD.state = 'APPROVED' AND NEW.state <> 'SUPPRESSED') THEN
      RAISE EXCEPTION 'Discovery transition rejected';
    END IF;
    SELECT * INTO r FROM public.acquisition_discovery_reviews WHERE candidate_id = NEW.id AND version = NEW.version;
    IF r.id IS NULL OR r.state <> NEW.state THEN RAISE EXCEPTION 'Discovery review required'; END IF;
  END IF;
  IF public.acquisition_discovery_blocked(NEW.domain, NEW.source_identity, NEW.record_id) THEN
    IF NEW.state <> 'SUPPRESSED' THEN RAISE EXCEPTION 'Discovery suppression required'; END IF;
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER acquisition_discovery_candidate_guard BEFORE INSERT OR UPDATE ON public.acquisition_discovery_candidates
  FOR EACH ROW EXECUTE FUNCTION acquisition_discovery_candidate_guard();
--> statement-breakpoint
CREATE FUNCTION acquisition_discovery_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE c public.acquisition_discovery_candidates; m public.acquisition_discovery_identity_matches; expected_state varchar(24); current_status jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(820082);
  SELECT * INTO STRICT c FROM public.acquisition_discovery_candidates WHERE id = NEW.candidate_id FOR UPDATE;
  IF c.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'Discovery candidate expired'; END IF;
  IF TG_TABLE_NAME = 'acquisition_discovery_evidence' THEN
    IF c.state IN ('APPROVED','REJECTED','DUPLICATE') OR (c.state = 'SUPPRESSED' AND NEW.kind <> 'SOURCE')
      OR (SELECT count(*) FROM public.acquisition_discovery_evidence WHERE candidate_id = c.id) >= 32 THEN
      RAISE EXCEPTION 'Discovery evidence rejected';
    END IF;
  ELSE
    IF NEW.version <> c.version + 1 OR c.state IN ('REJECTED','SUPPRESSED','DUPLICATE')
      OR (c.state = 'APPROVED' AND NEW.decision <> 'SUPPRESS')
      OR (SELECT count(*) FROM public.acquisition_discovery_reviews WHERE candidate_id = c.id) >= 32 THEN
      RAISE EXCEPTION 'Discovery review rejected';
    END IF;
    IF NEW.finding_id IS NOT NULL THEN
      SELECT * INTO m FROM public.acquisition_discovery_identity_matches WHERE id = NEW.finding_id AND candidate_id = c.id;
      IF m.id IS NULL OR (NEW.decision = 'RESOLVE_DISTINCT' AND m.kind <> 'POSSIBLE_NAME_MATCH')
        OR EXISTS (SELECT 1 FROM public.acquisition_discovery_reviews WHERE finding_id = m.id AND decision = 'RESOLVE_DISTINCT') THEN
        RAISE EXCEPTION 'Discovery finding rejected';
      END IF;
    END IF;
    expected_state := CASE NEW.decision WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED'
      WHEN 'SUPPRESS' THEN 'SUPPRESSED' WHEN 'DUPLICATE' THEN 'DUPLICATE' ELSE 'NEEDS_EVIDENCE' END;
    IF NEW.decision = 'RESOLVE_DISTINCT' AND EXISTS (SELECT 1 FROM public.acquisition_discovery_identity_matches f
      WHERE f.candidate_id = c.id AND f.id <> NEW.finding_id AND NOT EXISTS
      (SELECT 1 FROM public.acquisition_discovery_reviews r WHERE r.finding_id = f.id AND r.decision = 'RESOLVE_DISTINCT')) THEN
      expected_state := 'IDENTITY_CONFLICT';
    END IF;
    IF NEW.state <> expected_state THEN RAISE EXCEPTION 'Discovery review state rejected'; END IF;
  END IF;
  -- Authorization instant: status captures wall time after gathering protected facts.
  -- The API has validated session_user and holds the shared authority/suppression lock;
  -- candidate version/lifecycle/finding ownership are checked above under its row lock.
  -- No deferred trigger is relied on for a wall-clock commit deadline.
  current_status := public.acquisition_discovery_status(c);
  IF NOT (current_status->>'policyAllowed')::boolean THEN RAISE EXCEPTION 'POLICY_DENIED'; END IF;
  IF (current_status->>'expired')::boolean THEN RAISE EXCEPTION 'EXPIRED'; END IF;
  IF TG_TABLE_NAME = 'acquisition_discovery_reviews' THEN
    IF NEW.decision <> 'SUPPRESS' AND (current_status->>'suppressed')::boolean THEN RAISE EXCEPTION 'SUPPRESSED'; END IF;
    IF NEW.decision = 'APPROVE' AND current_status->'eligibility'->>'status' <> 'READY_FOR_APPROVAL' THEN
      RAISE EXCEPTION 'Discovery approval evidence required';
    END IF;
  ELSIF NEW.kind <> 'SOURCE' AND (current_status->>'suppressed')::boolean THEN RAISE EXCEPTION 'SUPPRESSED';
  END IF;
  NEW.created_at := (current_status->'eligibility'->>'evaluatedAt')::timestamptz;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER acquisition_discovery_evidence_guard BEFORE INSERT ON public.acquisition_discovery_evidence
  FOR EACH ROW EXECUTE FUNCTION acquisition_discovery_history_guard();
--> statement-breakpoint
CREATE TRIGGER acquisition_discovery_review_guard BEFORE INSERT ON public.acquisition_discovery_reviews
  FOR EACH ROW EXECUTE FUNCTION acquisition_discovery_history_guard();
--> statement-breakpoint
-- Deferred checks ensure neither a partial batch nor an unattached review can commit.
CREATE FUNCTION acquisition_discovery_complete_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE target_batch_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'acquisition_discovery_reviews' THEN
    IF NOT EXISTS (SELECT 1 FROM public.acquisition_discovery_candidates WHERE id = NEW.candidate_id AND version >= NEW.version) THEN
      RAISE EXCEPTION 'Discovery review transition incomplete';
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'acquisition_discovery_batches' THEN target_batch_id := NEW.id;
    ELSE target_batch_id := NEW.batch_id; END IF;
    IF (SELECT count(*) FROM public.acquisition_discovery_candidates c WHERE c.batch_id = target_batch_id) <>
      (SELECT b.count FROM public.acquisition_discovery_batches b WHERE b.id = target_batch_id)
      OR EXISTS (SELECT 1 FROM public.acquisition_discovery_candidates c WHERE c.batch_id = target_batch_id AND NOT EXISTS
        (SELECT 1 FROM public.acquisition_discovery_evidence e WHERE e.candidate_id = c.id AND e.kind = 'SOURCE')) THEN
      RAISE EXCEPTION 'Discovery batch incomplete';
    END IF;
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER acquisition_discovery_batch_complete AFTER INSERT ON public.acquisition_discovery_batches
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION acquisition_discovery_complete_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER acquisition_discovery_candidate_complete AFTER INSERT ON public.acquisition_discovery_candidates
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION acquisition_discovery_complete_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER acquisition_discovery_review_complete AFTER INSERT ON public.acquisition_discovery_reviews
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION acquisition_discovery_complete_guard();
--> statement-breakpoint
-- Helpers are private to the function owner; no capability login can call them.
CREATE FUNCTION public.acquisition_discovery_shape(v jsonb, fields text[]) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v)) <> cardinality(fields) OR NOT v ?& fields THEN
    RAISE EXCEPTION 'INVALID_REQUEST';
  END IF;
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_strings(v jsonb, fields text[]) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE f text; val text;
BEGIN
  FOREACH f IN ARRAY fields LOOP
    val := v->>f;
    IF jsonb_typeof(v->f) IS DISTINCT FROM 'string' OR val = '' OR val <> btrim(val)
      OR val ~ '[<>[:cntrl:]]' OR length(val) > 1024 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  END LOOP;
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_authority_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE p jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(820082);
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked OR NOT NEW.revoked OR (to_jsonb(NEW)-'revoked') <> (to_jsonb(OLD)-'revoked') THEN
      RAISE EXCEPTION 'Discovery authority is immutable';
    END IF;
    RETURN NEW;
  END IF;
  NEW.provisioned_by := session_user;
  NEW.created_at := clock_timestamp();
  IF TG_TABLE_NAME = 'acquisition_discovery_policies' THEN
    p := NEW.snapshot::jsonb;
    PERFORM public.acquisition_discovery_shape(p, ARRAY['key','version','sourceIdentity','status','method','allowedFields','authority','evidenceReference','reviewedAt','effectiveAt','expiresAt','revoked','retentionDays']);
    PERFORM public.acquisition_discovery_strings(p, ARRAY['key','version','sourceIdentity','status','method','authority','evidenceReference','reviewedAt','effectiveAt','expiresAt']);
    IF p->>'key' <> NEW.key OR p->>'version' <> NEW.version
      OR NEW.fingerprint <> encode(sha256(convert_to(to_json(NEW.snapshot)::text,'UTF8')),'hex')
      OR p->>'key' !~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'
      OR p->>'version' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      OR p->>'sourceIdentity' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
      OR p->>'status' NOT IN ('APPROVED','REQUIRES_REVIEW','PROHIBITED')
      OR p->>'method' NOT IN ('SYNTHETIC_FIXTURE','UNAPPROVED')
      OR jsonb_typeof(p->'revoked') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p->'retentionDays') IS DISTINCT FROM 'number'
      OR (p->>'retentionDays')::numeric NOT BETWEEN 1 AND 7
      OR (p->>'retentionDays')::numeric <> trunc((p->>'retentionDays')::numeric)
      OR p->'allowedFields' <> '["country","domain","name","observedAt","recordId","segment","url"]'::jsonb
      OR (p->>'reviewedAt')::timestamptz > clock_timestamp()
      OR (p->>'effectiveAt')::timestamptz >= (p->>'expiresAt')::timestamptz THEN
      RAISE EXCEPTION 'Discovery policy rejected';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER discovery_binding_authority BEFORE INSERT OR UPDATE ON public.acquisition_discovery_principal_bindings
FOR EACH ROW EXECUTE FUNCTION public.acquisition_discovery_authority_guard();
--> statement-breakpoint
CREATE TRIGGER discovery_policy_authority BEFORE INSERT OR UPDATE ON public.acquisition_discovery_policies
FOR EACH ROW EXECUTE FUNCTION public.acquisition_discovery_authority_guard();
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_principal(required_capability text, expected_principal uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE binding public.acquisition_discovery_principal_bindings;
BEGIN
  -- A caller-held repeatable snapshot could conceal committed policy/binding revocation.
  IF current_setting('transaction_isolation') <> 'read committed' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO binding FROM public.acquisition_discovery_principal_bindings WHERE database_role = session_user AND NOT revoked;
  IF binding.principal_id IS NULL OR binding.principal_id IS DISTINCT FROM expected_principal
    OR (required_capability IS NOT NULL AND binding.capability <> required_capability) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN binding.principal_id;
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_policy(policy_key text, policy_version text, expected_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE authority public.acquisition_discovery_policies; p jsonb;
BEGIN
  SELECT * INTO authority FROM public.acquisition_discovery_policies WHERE key = policy_key AND version = policy_version;
  p := authority.snapshot::jsonb;
  IF authority.key IS NULL OR authority.revoked OR authority.fingerprint IS DISTINCT FROM expected_fingerprint
    OR p->>'status' <> 'APPROVED' OR p->>'method' <> 'SYNTHETIC_FIXTURE' OR (p->>'revoked')::boolean
    OR (p->>'effectiveAt')::timestamptz > clock_timestamp() OR (p->>'expiresAt')::timestamptz <= clock_timestamp() THEN
    RAISE EXCEPTION 'POLICY_DENIED';
  END IF;
  RETURN p;
END; $$;
--> statement-breakpoint
-- Read historical overlap, so release cannot erase an already affected identity.
-- A release before every matching candidate's creation does not affect that identity.
CREATE FUNCTION public.acquisition_discovery_blocked(d text, source text, record text) RETURNS boolean
LANGUAGE sql SET search_path = pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.acquisition_suppression_entries s WHERE s.kind='DOMAIN' AND s.target=d AND s.released_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.acquisition_discovery_candidates c
      WHERE (c.domain=d OR (c.source_identity=source AND c.record_id=record)) AND
      (c.state='SUPPRESSED' OR EXISTS (SELECT 1 FROM public.acquisition_discovery_suppression_marks m
        WHERE m.domain=c.domain AND m.event='ACTIVE' AND m.observed_at<c.expires_at
          AND NOT EXISTS (SELECT 1 FROM public.acquisition_discovery_suppression_marks r
            WHERE r.suppression_id=m.suppression_id AND r.event='RELEASE' AND r.observed_at<c.created_at))
      OR EXISTS (SELECT 1 FROM public.acquisition_suppression_entries s
        WHERE s.kind='DOMAIN' AND s.target=c.domain AND s.created_at < c.expires_at
          AND NOT EXISTS (SELECT 1 FROM public.acquisition_discovery_suppression_marks observed
            WHERE observed.suppression_id=s.id AND observed.event='ACTIVE')
          AND (s.released_at IS NULL OR s.released_at >= c.created_at))));
$$;
--> statement-breakpoint
-- Observe Task 0082 without rewriting its records, grants, or release semantics.
-- Record server-observed ACTIVE/RELEASE events, independent of caller timestamps
-- and any caller-held snapshot of candidate rows. Existing Task 0082 rows are untouched.
CREATE FUNCTION public.acquisition_discovery_capture_suppression() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.kind <> 'DOMAIN' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.released_at IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(820082);
  INSERT INTO public.acquisition_discovery_suppression_marks(suppression_id,event,domain,observed_at)
    VALUES(NEW.id,CASE WHEN TG_OP='INSERT' THEN 'ACTIVE' ELSE 'RELEASE' END,NEW.target,clock_timestamp());
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER discovery_capture_suppression AFTER INSERT OR UPDATE ON public.acquisition_suppression_entries
FOR EACH ROW EXECUTE FUNCTION public.acquisition_discovery_capture_suppression();
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_match_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE c public.acquisition_discovery_candidates; other public.acquisition_discovery_candidates; expected_kind text;
BEGIN
  PERFORM pg_advisory_xact_lock(820082);
  SELECT * INTO STRICT c FROM public.acquisition_discovery_candidates WHERE id=NEW.candidate_id FOR UPDATE;
  SELECT * INTO STRICT other FROM public.acquisition_discovery_candidates WHERE id=NEW.other_candidate_id;
  IF c.state IN ('APPROVED','REJECTED','SUPPRESSED','DUPLICATE') OR c.expires_at <= clock_timestamp()
    OR (SELECT count(*) FROM public.acquisition_discovery_identity_matches WHERE candidate_id=c.id) >= 20 THEN
    RAISE EXCEPTION 'Discovery finding rejected';
  END IF;
  expected_kind := CASE WHEN c.domain=other.domain OR (c.source_identity=other.source_identity AND c.record_id=other.record_id)
    THEN CASE WHEN c.name=other.name AND c.country=other.country AND c.domain=other.domain THEN 'EXACT_DUPLICATE' ELSE 'STRONG_CONFLICT' END
    WHEN c.name_key=other.name_key AND c.country=other.country THEN 'POSSIBLE_NAME_MATCH' ELSE NULL END;
  IF NEW.kind IS DISTINCT FROM expected_kind THEN RAISE EXCEPTION 'Discovery finding rejected'; END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER discovery_match_guard BEFORE INSERT ON public.acquisition_discovery_identity_matches
FOR EACH ROW EXECUTE FUNCTION public.acquisition_discovery_match_guard();
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_current(candidate_id uuid, allow_suppressed boolean DEFAULT false) RETURNS public.acquisition_discovery_candidates
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE c public.acquisition_discovery_candidates; current_status jsonb;
BEGIN
  SELECT * INTO c FROM public.acquisition_discovery_candidates WHERE id=candidate_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  current_status := public.acquisition_discovery_status(c);
  IF NOT (current_status->>'policyAllowed')::boolean THEN RAISE EXCEPTION 'POLICY_DENIED'; END IF;
  IF (current_status->>'expired')::boolean THEN RAISE EXCEPTION 'EXPIRED'; END IF;
  IF NOT allow_suppressed AND (current_status->>'suppressed')::boolean THEN RAISE EXCEPTION 'SUPPRESSED'; END IF;
  RETURN c;
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_receipt(principal uuid, operation_kind text, operation_key text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE old public.acquisition_discovery_operations;
BEGIN
  IF operation_key IS NULL OR length(operation_key)>128 OR operation_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  SELECT * INTO old FROM public.acquisition_discovery_operations WHERE principal_id=principal AND kind=operation_kind AND key=operation_key;
  IF old.key IS NOT NULL AND old.fingerprint <> encode(sha256(convert_to(payload::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  RETURN old.result;
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_save_receipt(principal uuid, operation_kind text, operation_key text, payload jsonb, receipt jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  INSERT INTO public.acquisition_discovery_operations(principal_id,key,kind,fingerprint,result,created_at)
    VALUES(principal,operation_key,operation_kind,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),receipt,clock_timestamp());
  RETURN receipt;
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_submit(expected_principal uuid, input jsonb, expected_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout='3s' SET TimeZone='UTC' AS $$
DECLARE principal uuid; p jsonb; receipt jsonb; payload jsonb; fact jsonb; bid uuid:=gen_random_uuid(); cid uuid;
  stamp timestamptz; deadline timestamptz; prior_deadline timestamptz; position integer:=0; prior_count integer;
  source text; snapshot text; state text; candidate_key text; old public.acquisition_discovery_candidates; match_kind text;
BEGIN
  PERFORM pg_advisory_xact_lock(820082);
  principal := public.acquisition_discovery_principal('INTAKE',expected_principal);
  PERFORM public.acquisition_discovery_shape(input,ARRAY['synthetic','idempotencyKey','policyKey','policyVersion','method','runReference','candidates']);
  PERFORM public.acquisition_discovery_strings(input,ARRAY['idempotencyKey','policyKey','policyVersion','method','runReference']);
  IF input->'synthetic' <> 'true'::jsonb OR input->>'method' <> 'SYNTHETIC_FIXTURE'
    OR jsonb_typeof(input->'candidates') IS DISTINCT FROM 'array' OR octet_length(input::text)>65536 THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  IF jsonb_array_length(input->'candidates') NOT BETWEEN 1 AND 20
    OR input->>'runReference' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  p := public.acquisition_discovery_policy(input->>'policyKey',input->>'policyVersion',expected_fingerprint);
  source := p->>'sourceIdentity';
  payload := jsonb_build_object('version','discovery-2','input',input,'policyFingerprint',expected_fingerprint);
  receipt := public.acquisition_discovery_receipt(principal,'BATCH',input->>'idempotencyKey',payload);
  IF receipt IS NOT NULL THEN
    FOR old IN SELECT * FROM public.acquisition_discovery_candidates WHERE batch_id=(receipt->>'batchId')::uuid LOOP
      PERFORM public.acquisition_discovery_current(old.id);
    END LOOP;
    RETURN receipt;
  END IF;
  stamp := clock_timestamp();
  SELECT policies.snapshot INTO snapshot FROM public.acquisition_discovery_policies policies WHERE key=input->>'policyKey' AND version=input->>'policyVersion';
  INSERT INTO public.acquisition_discovery_batches(id,principal_id,synthetic,policy_key,policy_version,policy_fingerprint,policy_snapshot,source_identity,method,run_reference,count,created_at)
    VALUES(bid,principal,true,input->>'policyKey',input->>'policyVersion',expected_fingerprint,snapshot,source,'SYNTHETIC_FIXTURE',input->>'runReference',jsonb_array_length(input->'candidates'),stamp);
  FOR fact IN SELECT value FROM jsonb_array_elements(input->'candidates') LOOP
    PERFORM public.acquisition_discovery_shape(fact,ARRAY['name','country','domain','recordId','segment','url','observedAt']);
    PERFORM public.acquisition_discovery_strings(fact,ARRAY['name','country','domain','recordId','segment','url','observedAt']);
    IF fact->>'name' <> normalize(fact->>'name',NFC) OR (fact->>'observedAt')::timestamptz > stamp THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
    candidate_key := regexp_replace(lower(fact->>'name'),'\s+',' ','g');
    SELECT count(*) INTO prior_count FROM public.acquisition_discovery_candidates c WHERE c.domain=fact->>'domain'
      OR (c.source_identity=source AND c.record_id=fact->>'recordId') OR (c.name_key=candidate_key AND c.country=fact->>'country');
    IF prior_count > 20 THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    SELECT min(c.expires_at) INTO prior_deadline FROM public.acquisition_discovery_candidates c WHERE c.domain=fact->>'domain' OR (c.source_identity=source AND c.record_id=fact->>'recordId');
    deadline := least(stamp+make_interval(hours=>24*(p->>'retentionDays')::integer),(p->>'expiresAt')::timestamptz,prior_deadline);
    IF deadline <= clock_timestamp() THEN RAISE EXCEPTION 'EXPIRED'; END IF;
    state := CASE WHEN public.acquisition_discovery_blocked(fact->>'domain',source,fact->>'recordId') THEN 'SUPPRESSED' WHEN prior_count>0 THEN 'IDENTITY_CONFLICT' ELSE 'PENDING_REVIEW' END;
    cid := gen_random_uuid(); position := position+1;
    INSERT INTO public.acquisition_discovery_candidates(id,batch_id,position,name,name_key,country,domain,source_identity,record_id,segment,fingerprint,state,version,created_at,expires_at)
      VALUES(cid,bid,position,fact->>'name',candidate_key,fact->>'country',fact->>'domain',source,fact->>'recordId',fact->>'segment',encode(sha256(convert_to(jsonb_build_object('source',source,'fact',fact)::text,'UTF8')),'hex'),state,0,stamp,deadline);
    INSERT INTO public.acquisition_discovery_evidence(id,candidate_id,principal_id,kind,finding,url,reference,observed_at,created_at)
      VALUES(gen_random_uuid(),cid,principal,'SOURCE','OBSERVED',fact->>'url',input->>'runReference',(fact->>'observedAt')::timestamptz,stamp);
    IF state <> 'SUPPRESSED' THEN
      FOR old IN SELECT * FROM public.acquisition_discovery_candidates c WHERE c.id<>cid AND (c.domain=fact->>'domain'
        OR (c.source_identity=source AND c.record_id=fact->>'recordId') OR (c.name_key=candidate_key AND c.country=fact->>'country')) ORDER BY c.id LOOP
        match_kind := CASE WHEN old.domain=fact->>'domain' OR (old.source_identity=source AND old.record_id=fact->>'recordId')
          THEN CASE WHEN old.name=fact->>'name' AND old.country=fact->>'country' AND old.domain=fact->>'domain' THEN 'EXACT_DUPLICATE' ELSE 'STRONG_CONFLICT' END ELSE 'POSSIBLE_NAME_MATCH' END;
        INSERT INTO public.acquisition_discovery_identity_matches(id,candidate_id,other_candidate_id,kind,created_at) VALUES(gen_random_uuid(),cid,old.id,match_kind,stamp);
      END LOOP;
    END IF;
  END LOOP;
  RETURN public.acquisition_discovery_save_receipt(principal,'BATCH',input->>'idempotencyKey',payload,jsonb_build_object('receiptId',bid,'batchId',bid));
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_evidence(expected_principal uuid, candidate_id uuid, input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout='3s' SET TimeZone='UTC' AS $$
DECLARE principal uuid; c public.acquisition_discovery_candidates; receipt jsonb; payload jsonb; rid uuid:=gen_random_uuid();
BEGIN
  PERFORM pg_advisory_xact_lock(820082);
  principal := public.acquisition_discovery_principal('REVIEW',expected_principal);
  PERFORM public.acquisition_discovery_shape(input,ARRAY['idempotencyKey','expectedVersion','kind','finding','url','observedAt','reference']);
  PERFORM public.acquisition_discovery_strings(input,ARRAY['idempotencyKey','kind','finding','url','observedAt','reference']);
  IF octet_length(input::text)>8192 OR input->>'kind' NOT IN ('WEBSITE','SEGMENT','PACKAGING') OR input->>'finding' NOT IN ('SUPPORTS','CONTRADICTS')
    OR jsonb_typeof(input->'expectedVersion') IS DISTINCT FROM 'number' OR input->>'expectedVersion' !~ '^[0-9]+$' THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  c := public.acquisition_discovery_current(candidate_id);
  payload := jsonb_build_object('version','discovery-2','id',candidate_id,'input',input);
  receipt := public.acquisition_discovery_receipt(principal,'EVIDENCE',input->>'idempotencyKey',payload);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF c.version <> (input->>'expectedVersion')::integer OR c.state IN ('APPROVED','REJECTED','SUPPRESSED','DUPLICATE') THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  INSERT INTO public.acquisition_discovery_evidence(id,candidate_id,principal_id,kind,finding,url,reference,observed_at,created_at)
    VALUES(rid,c.id,principal,input->>'kind',input->>'finding',input->>'url',input->>'reference',(input->>'observedAt')::timestamptz,clock_timestamp());
  RETURN public.acquisition_discovery_save_receipt(principal,'EVIDENCE',input->>'idempotencyKey',payload,jsonb_build_object('receiptId',rid,'candidateId',c.id));
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_review(expected_principal uuid, candidate_id uuid, input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout='3s' SET TimeZone='UTC' AS $$
DECLARE principal uuid; c public.acquisition_discovery_candidates; receipt jsonb; payload jsonb; rid uuid:=gen_random_uuid(); next_state text;
BEGIN
  PERFORM pg_advisory_xact_lock(820082);
  principal := public.acquisition_discovery_principal('REVIEW',expected_principal);
  PERFORM public.acquisition_discovery_shape(input,ARRAY['idempotencyKey','expectedVersion','decision','reason','findingId']);
  PERFORM public.acquisition_discovery_strings(input,ARRAY['idempotencyKey','decision','reason']);
  IF octet_length(input::text)>8192 OR jsonb_typeof(input->'expectedVersion') IS DISTINCT FROM 'number' OR input->>'expectedVersion' !~ '^[0-9]+$'
    OR input->>'decision' NOT IN ('APPROVE','REJECT','SUPPRESS','DUPLICATE','NEEDS_EVIDENCE','RESOLVE_DISTINCT')
    OR (input->>'findingId' IS NOT NULL) <> (input->>'decision' IN ('DUPLICATE','RESOLVE_DISTINCT')) THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  c := public.acquisition_discovery_current(candidate_id,input->>'decision'='SUPPRESS');
  payload := jsonb_build_object('version','discovery-2','id',candidate_id,'input',input);
  receipt := public.acquisition_discovery_receipt(principal,'REVIEW',input->>'idempotencyKey',payload);
  IF receipt IS NOT NULL THEN RETURN receipt; END IF;
  IF c.version <> (input->>'expectedVersion')::integer OR c.state IN ('REJECTED','SUPPRESSED','DUPLICATE') OR (c.state='APPROVED' AND input->>'decision'<>'SUPPRESS') THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  next_state := CASE input->>'decision' WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' WHEN 'SUPPRESS' THEN 'SUPPRESSED' WHEN 'DUPLICATE' THEN 'DUPLICATE' ELSE 'NEEDS_EVIDENCE' END;
  IF input->>'decision'='RESOLVE_DISTINCT' AND EXISTS(SELECT 1 FROM public.acquisition_discovery_identity_matches f WHERE f.candidate_id=c.id AND f.id<>(input->>'findingId')::uuid
    AND NOT EXISTS(SELECT 1 FROM public.acquisition_discovery_reviews r WHERE r.finding_id=f.id AND r.decision='RESOLVE_DISTINCT')) THEN next_state:='IDENTITY_CONFLICT'; END IF;
  INSERT INTO public.acquisition_discovery_reviews(id,candidate_id,reviewer_id,decision,reason,finding_id,version,state,created_at)
    VALUES(rid,c.id,principal,input->>'decision',input->>'reason',(input->>'findingId')::uuid,c.version+1,next_state,clock_timestamp());
  UPDATE public.acquisition_discovery_candidates SET state=next_state,version=c.version+1 WHERE id=c.id;
  RETURN public.acquisition_discovery_save_receipt(principal,'REVIEW',input->>'idempotencyKey',payload,jsonb_build_object('receiptId',rid,'candidateId',c.id));
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_status(c public.acquisition_discovery_candidates) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE b public.acquisition_discovery_batches; p jsonb; allowed boolean:=true; blocked boolean;
  conflict boolean; supported boolean; stamp timestamptz; effective_status text;
BEGIN
  SELECT * INTO STRICT b FROM public.acquisition_discovery_batches WHERE id=c.batch_id;
  BEGIN
    p := public.acquisition_discovery_policy(b.policy_key,b.policy_version,b.policy_fingerprint);
  EXCEPTION WHEN raise_exception THEN allowed:=false;
  END;
  blocked := c.state='SUPPRESSED' OR public.acquisition_discovery_blocked(c.domain,c.source_identity,c.record_id);
  conflict := EXISTS (SELECT 1 FROM public.acquisition_discovery_identity_matches f WHERE f.candidate_id=c.id AND NOT EXISTS
    (SELECT 1 FROM public.acquisition_discovery_reviews r WHERE r.finding_id=f.id AND r.decision='RESOLVE_DISTINCT'))
    OR EXISTS (SELECT 1 FROM public.acquisition_discovery_candidates other WHERE other.id<>c.id AND other.state='APPROVED'
      AND (other.domain=c.domain OR (other.source_identity=c.source_identity AND other.record_id=c.record_id)));
  supported := NOT EXISTS (SELECT 1 FROM public.acquisition_discovery_evidence WHERE candidate_id=c.id AND finding='CONTRADICTS')
    AND (SELECT count(DISTINCT kind) FROM public.acquisition_discovery_evidence WHERE candidate_id=c.id AND finding='SUPPORTS' AND kind IN ('WEBSITE','SEGMENT','PACKAGING'))=3;
  stamp := clock_timestamp();
  -- Time is sampled last, never transaction_timestamp/current_timestamp/now().
  allowed := allowed AND coalesce((p->>'effectiveAt')::timestamptz<=stamp AND stamp<(p->>'expiresAt')::timestamptz,false);
  -- Keep the domain discoveryEligibility contract and precedence identical.
  effective_status := CASE WHEN c.expires_at<=stamp THEN 'EXPIRED' WHEN NOT allowed THEN 'POLICY_DENIED'
    WHEN blocked THEN 'SUPPRESSED' WHEN c.state IN ('REJECTED','DUPLICATE') THEN 'TERMINAL'
    WHEN conflict THEN 'IDENTITY_CONFLICT' WHEN NOT supported THEN 'EVIDENCE_REQUIRED'
    WHEN c.state='APPROVED' THEN 'CURRENTLY_APPROVED' ELSE 'READY_FOR_APPROVAL' END;
  RETURN jsonb_build_object('id',c.id,'state',c.state,'version',c.version,'expiresAt',c.expires_at,
    'expired',c.expires_at<=stamp,'suppressed',blocked,'policyAllowed',allowed,
    'eligibility',jsonb_build_object('contract','authorization-time-v1','evaluatedAt',stamp,'status',effective_status));
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_batch(expected_principal uuid, batch_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout='3s' SET TimeZone='UTC' AS $$
DECLARE principal uuid; b public.acquisition_discovery_batches; result jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(820082);
  principal:=public.acquisition_discovery_principal(NULL,expected_principal);
  SELECT * INTO b FROM public.acquisition_discovery_batches WHERE id=batch_id;
  IF b.id IS NULL OR (session_user <> 'discovery_reviewer' AND b.principal_id<>principal) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT coalesce(jsonb_agg(public.acquisition_discovery_status(c) ORDER BY c.position),'[]'::jsonb) INTO result FROM public.acquisition_discovery_candidates c WHERE c.batch_id=b.id;
  RETURN jsonb_build_object('batchId',b.id,'candidates',result);
END; $$;
--> statement-breakpoint
CREATE FUNCTION public.acquisition_discovery_queue(after_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout='3s' SET TimeZone='UTC' AS $$
DECLARE principal uuid; c public.acquisition_discovery_candidates; result jsonb:='[]'::jsonb; facts jsonb; findings jsonb; seen integer:=0; last_id uuid; next_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(820082);
  SELECT principal_id INTO principal FROM public.acquisition_discovery_principal_bindings WHERE database_role=session_user;
  PERFORM public.acquisition_discovery_principal('REVIEW',principal);
  FOR c IN SELECT * FROM public.acquisition_discovery_candidates WHERE after_id IS NULL OR id>after_id ORDER BY id LIMIT 21 LOOP
    seen:=seen+1;
    IF seen=21 THEN next_id:=last_id; EXIT; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'finding',e.finding,'url',e.url,'reference',e.reference,'observedAt',e.observed_at) ORDER BY e.created_at,e.id),'[]'::jsonb)
      INTO facts FROM public.acquisition_discovery_evidence e WHERE e.candidate_id=c.id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'otherCandidateId',m.other_candidate_id,'kind',m.kind,'resolved',EXISTS(SELECT 1 FROM public.acquisition_discovery_reviews r WHERE r.finding_id=m.id AND r.decision='RESOLVE_DISTINCT')) ORDER BY m.id),'[]'::jsonb)
      INTO findings FROM public.acquisition_discovery_identity_matches m WHERE m.candidate_id=c.id;
    result:=result || jsonb_build_array(public.acquisition_discovery_status(c) || jsonb_build_object('name',c.name,'country',c.country,'domain',c.domain,'segment',c.segment,'evidence',facts,'matches',findings));
    last_id:=c.id;
  END LOOP;
  RETURN jsonb_build_object('candidates',result,'nextCursor',next_id);
END; $$;
--> statement-breakpoint
-- Each function is transferred explicitly; only the five API entry points are public
-- capabilities. Trigger/helper functions cannot be invoked by runtime principals.
ALTER FUNCTION public.acquisition_discovery_submit(uuid,jsonb,text) OWNER TO discovery_mutation_owner;
ALTER FUNCTION public.acquisition_discovery_evidence(uuid,uuid,jsonb) OWNER TO discovery_mutation_owner;
ALTER FUNCTION public.acquisition_discovery_review(uuid,uuid,jsonb) OWNER TO discovery_mutation_owner;
ALTER FUNCTION public.acquisition_discovery_batch(uuid,uuid) OWNER TO discovery_mutation_owner;
ALTER FUNCTION public.acquisition_discovery_queue(uuid) OWNER TO discovery_mutation_owner;
ALTER FUNCTION public.acquisition_discovery_complete_guard() OWNER TO discovery_mutation_owner;
ALTER FUNCTION public.acquisition_discovery_capture_suppression() OWNER TO discovery_mutation_owner;
--> statement-breakpoint
SET ROLE discovery_mutation_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acquisition_discovery_submit(uuid,jsonb,text), public.acquisition_discovery_evidence(uuid,uuid,jsonb),
  public.acquisition_discovery_review(uuid,uuid,jsonb), public.acquisition_discovery_batch(uuid,uuid), public.acquisition_discovery_queue(uuid), public.acquisition_discovery_complete_guard(), public.acquisition_discovery_capture_suppression() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acquisition_discovery_submit(uuid,jsonb,text) TO discovery_intake;
GRANT EXECUTE ON FUNCTION public.acquisition_discovery_batch(uuid,uuid) TO discovery_intake, discovery_reviewer;
GRANT EXECUTE ON FUNCTION public.acquisition_discovery_evidence(uuid,uuid,jsonb), public.acquisition_discovery_review(uuid,uuid,jsonb), public.acquisition_discovery_queue(uuid) TO discovery_reviewer;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acquisition_discovery_shape(jsonb,text[]), public.acquisition_discovery_strings(jsonb,text[]),
  public.acquisition_discovery_principal(text,uuid), public.acquisition_discovery_policy(text,text,text),
  public.acquisition_discovery_blocked(text,text,text), public.acquisition_discovery_current(uuid,boolean),
  public.acquisition_discovery_receipt(uuid,text,text,jsonb), public.acquisition_discovery_save_receipt(uuid,text,text,jsonb,jsonb),
  public.acquisition_discovery_status(public.acquisition_discovery_candidates), public.acquisition_discovery_match_guard(),
  public.acquisition_discovery_authority_guard(), public.acquisition_discovery_candidate_guard(),
  public.acquisition_discovery_history_guard() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acquisition_discovery_shape(jsonb,text[]), public.acquisition_discovery_strings(jsonb,text[]),
  public.acquisition_discovery_principal(text,uuid), public.acquisition_discovery_policy(text,text,text),
  public.acquisition_discovery_blocked(text,text,text), public.acquisition_discovery_current(uuid,boolean),
  public.acquisition_discovery_receipt(uuid,text,text,jsonb), public.acquisition_discovery_save_receipt(uuid,text,text,jsonb,jsonb),
  public.acquisition_discovery_status(public.acquisition_discovery_candidates) TO discovery_mutation_owner;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acquisition_discovery_shape(jsonb,text[]), public.acquisition_discovery_strings(jsonb,text[]) TO discovery_provisioner;
--> statement-breakpoint
