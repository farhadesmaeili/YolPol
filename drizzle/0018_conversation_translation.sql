CREATE TABLE "conversation_message_languages" (
	"message_id" varchar(160) PRIMARY KEY NOT NULL,
	"source_locale" varchar(2),
	"customer_target_locale" varchar(2),
	"delivery_state" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "message_language_source_check" CHECK ("conversation_message_languages"."source_locale" in ('en','tr','fa','ar')),
	CONSTRAINT "message_language_target_check" CHECK ("conversation_message_languages"."customer_target_locale" in ('en','tr','fa','ar')),
	CONSTRAINT "message_delivery_state_check" CHECK ("conversation_message_languages"."delivery_state" in ('ACTIVE','SKIPPED') and "conversation_message_languages"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "conversation_message_translations" (
	"id" varchar(180) PRIMARY KEY NOT NULL,
	"message_id" varchar(160) NOT NULL,
	"source_locale" varchar(2) NOT NULL,
	"target_locale" varchar(2) NOT NULL,
	"status" varchar(20) NOT NULL,
	"body" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "translation_locale_check" CHECK ("conversation_message_translations"."source_locale" in ('en','tr','fa','ar') and "conversation_message_translations"."target_locale" in ('en','tr','fa','ar') and "conversation_message_translations"."source_locale" <> "conversation_message_translations"."target_locale"),
	CONSTRAINT "translation_status_check" CHECK ("conversation_message_translations"."status" in ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
	CONSTRAINT "translation_body_check" CHECK (("conversation_message_translations"."status" = 'SUCCEEDED' and "conversation_message_translations"."body" is not null and char_length("conversation_message_translations"."body") between 1 and 10000) or ("conversation_message_translations"."status" <> 'SUCCEEDED' and "conversation_message_translations"."body" is null)),
	CONSTRAINT "translation_version_check" CHECK ("conversation_message_translations"."version" > 0 and "conversation_message_translations"."updated_at" >= "conversation_message_translations"."created_at")
);
--> statement-breakpoint
CREATE TABLE "conversation_translation_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"message_id" varchar(160) NOT NULL,
	"translation_id" varchar(180),
	"action" varchar(24) NOT NULL,
	"actor_reference" varchar(180) NOT NULL,
	"previous_state" varchar(24) NOT NULL,
	"new_state" varchar(24) NOT NULL,
	"previous_version" integer NOT NULL,
	"new_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "translation_event_action_check" CHECK ("conversation_translation_events"."action" in ('RETRY','SKIP','CONFIRM_LANGUAGE')),
	CONSTRAINT "translation_event_version_check" CHECK ("conversation_translation_events"."previous_version" > 0 and "conversation_translation_events"."new_version" = "conversation_translation_events"."previous_version" + 1),
	CONSTRAINT "translation_event_actor_check" CHECK ("conversation_translation_events"."actor_reference" ~ '^staff:[A-Za-z0-9_-]{1,160}$')
);
--> statement-breakpoint
CREATE TABLE "conversation_translation_jobs" (
	"id" varchar(180) PRIMARY KEY NOT NULL,
	"message_id" varchar(160) NOT NULL,
	"target_locale" varchar(2) NOT NULL,
	"execution_id" varchar(200) NOT NULL,
	"status" varchar(20) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" varchar(64),
	"leased_until" timestamp with time zone,
	"failure_category" varchar(64),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "translation_job_status_check" CHECK ("conversation_translation_jobs"."status" in ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
	CONSTRAINT "translation_job_lease_check" CHECK (("conversation_translation_jobs"."status" = 'RUNNING' and "conversation_translation_jobs"."lease_token" is not null and "conversation_translation_jobs"."leased_until" is not null) or ("conversation_translation_jobs"."status" <> 'RUNNING' and "conversation_translation_jobs"."lease_token" is null and "conversation_translation_jobs"."leased_until" is null)),
	CONSTRAINT "translation_job_version_check" CHECK ("conversation_translation_jobs"."version" > 0 and "conversation_translation_jobs"."attempts" between 0 and 3 and "conversation_translation_jobs"."updated_at" >= "conversation_translation_jobs"."created_at")
);
--> statement-breakpoint
ALTER TABLE "conversation_message_languages" ADD CONSTRAINT "conversation_message_languages_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_translations" ADD CONSTRAINT "conversation_message_translations_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_translation_events" ADD CONSTRAINT "conversation_translation_events_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_translation_jobs" ADD CONSTRAINT "conversation_translation_jobs_id_conversation_message_translations_id_fk" FOREIGN KEY ("id") REFERENCES "public"."conversation_message_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "translation_message_target_uidx" ON "conversation_message_translations" USING btree ("message_id","target_locale");--> statement-breakpoint
ALTER TABLE "conversation_translation_jobs" ADD CONSTRAINT "conversation_translation_jobs_message_id_target_locale_conversation_message_translations_message_id_target_locale_fk" FOREIGN KEY ("message_id","target_locale") REFERENCES "public"."conversation_message_translations"("message_id","target_locale") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "translation_event_message_idx" ON "conversation_translation_events" USING btree ("message_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_job_message_target_uidx" ON "conversation_translation_jobs" USING btree ("message_id","target_locale");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_job_execution_uidx" ON "conversation_translation_jobs" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "translation_job_claim_idx" ON "conversation_translation_jobs" USING btree ("status","leased_until","created_at");--> statement-breakpoint
CREATE FUNCTION "prevent_translation_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "conversation_messages" WHERE "id" = OLD."message_id") THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'conversation_translation_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "translation_events_append_only_trigger"
  BEFORE UPDATE OR DELETE ON "conversation_translation_events"
  FOR EACH ROW EXECUTE FUNCTION "prevent_translation_event_mutation"();--> statement-breakpoint
CREATE FUNCTION "prevent_translation_delivery_revival"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."delivery_state" = 'SKIPPED' AND NEW."delivery_state" <> 'SKIPPED' THEN
    RAISE EXCEPTION 'Skipped Customer delivery is terminal' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "translation_delivery_terminal_trigger"
  BEFORE UPDATE ON "conversation_message_languages"
  FOR EACH ROW EXECUTE FUNCTION "prevent_translation_delivery_revival"();--> statement-breakpoint
-- Historical Website Customer locale is the durable inquiry locale, never text detection.
-- No historical Staff/AI authored language can be established from existing records.
-- Their originals stay intact and Staff must confirm language or explicitly skip delivery.
INSERT INTO "conversation_message_languages" ("message_id", "source_locale", "customer_target_locale")
SELECT m.id,
  CASE WHEN m.sender_type = 'CUSTOMER' AND m.channel = 'WEBSITE' THEN i.source_locale ELSE NULL END,
  CASE WHEN m.sender_type IN ('INTERNAL_USER','AI_AGENT') THEN i.source_locale ELSE NULL END
FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id JOIN inquiries i ON i.id = c.inquiry_id
ON CONFLICT (message_id) DO NOTHING;
