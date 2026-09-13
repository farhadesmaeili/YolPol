CREATE TABLE "conversation_ai_control_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(128) NOT NULL,
	"previous_state" varchar(24) NOT NULL,
	"new_state" varchar(24) NOT NULL,
	"previous_version" integer NOT NULL,
	"new_version" integer NOT NULL,
	"actor_reference" varchar(160) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_ai_control_events_id_check" CHECK ("conversation_ai_control_events"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "conversation_ai_control_events_states_check" CHECK ("conversation_ai_control_events"."previous_state" in ('AUTO','PAUSED','HUMAN_TAKEOVER') and "conversation_ai_control_events"."new_state" in ('AUTO','PAUSED','HUMAN_TAKEOVER') and "conversation_ai_control_events"."previous_state" <> "conversation_ai_control_events"."new_state"),
	CONSTRAINT "conversation_ai_control_events_versions_check" CHECK ("conversation_ai_control_events"."previous_version" >= 0 and "conversation_ai_control_events"."new_version" = "conversation_ai_control_events"."previous_version" + 1),
	CONSTRAINT "conversation_ai_control_events_actor_check" CHECK ("conversation_ai_control_events"."actor_reference" ~ '^staff:[A-Za-z0-9_-]{1,128}$')
);
--> statement-breakpoint
CREATE TABLE "conversation_ai_controls" (
	"conversation_id" varchar(128) PRIMARY KEY NOT NULL,
	"state" varchar(24) NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" varchar(160) NOT NULL,
	CONSTRAINT "conversation_ai_controls_state_check" CHECK ("conversation_ai_controls"."state" in ('AUTO','PAUSED','HUMAN_TAKEOVER')),
	CONSTRAINT "conversation_ai_controls_version_check" CHECK ("conversation_ai_controls"."version" >= 1),
	CONSTRAINT "conversation_ai_controls_actor_check" CHECK ("conversation_ai_controls"."updated_by" ~ '^staff:[A-Za-z0-9_-]{1,128}$')
);
--> statement-breakpoint
CREATE TABLE "conversation_ai_response_jobs" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(128) NOT NULL,
	"trigger_message_id" varchar(160) NOT NULL,
	"trigger_message_position" integer NOT NULL,
	"status" varchar(16) NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"execution_id" varchar(128) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" varchar(128),
	"leased_until" timestamp with time zone,
	"failure_category" varchar(64),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"terminal_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "conversation_ai_response_jobs_id_check" CHECK ("conversation_ai_response_jobs"."id" ~ '^ai_job_[A-Za-z0-9_-]{1,96}$'),
	CONSTRAINT "conversation_ai_response_jobs_position_check" CHECK ("conversation_ai_response_jobs"."trigger_message_position" >= 0),
	CONSTRAINT "conversation_ai_response_jobs_status_check" CHECK ("conversation_ai_response_jobs"."status" in ('PENDING','RUNNING','SUCCEEDED','CANCELLED','SUPERSEDED','FAILED')),
	CONSTRAINT "conversation_ai_response_jobs_attempts_check" CHECK ("conversation_ai_response_jobs"."attempts" between 0 and 3),
	CONSTRAINT "conversation_ai_response_jobs_version_check" CHECK ("conversation_ai_response_jobs"."version" >= 1),
	CONSTRAINT "conversation_ai_response_jobs_lease_check" CHECK (("conversation_ai_response_jobs"."status" = 'RUNNING' and "conversation_ai_response_jobs"."lease_token" is not null and "conversation_ai_response_jobs"."leased_until" is not null) or ("conversation_ai_response_jobs"."status" <> 'RUNNING' and "conversation_ai_response_jobs"."lease_token" is null and "conversation_ai_response_jobs"."leased_until" is null)),
	CONSTRAINT "conversation_ai_response_jobs_terminal_check" CHECK (("conversation_ai_response_jobs"."status" in ('SUCCEEDED','CANCELLED','SUPERSEDED','FAILED') and "conversation_ai_response_jobs"."terminal_at" is not null) or ("conversation_ai_response_jobs"."status" in ('PENDING','RUNNING') and "conversation_ai_response_jobs"."terminal_at" is null)),
	CONSTRAINT "conversation_ai_response_jobs_failure_check" CHECK (("conversation_ai_response_jobs"."status" = 'FAILED' and "conversation_ai_response_jobs"."failure_category" is not null) or ("conversation_ai_response_jobs"."status" <> 'FAILED' and "conversation_ai_response_jobs"."failure_category" is null)),
	CONSTRAINT "conversation_ai_response_jobs_timestamps_check" CHECK ("conversation_ai_response_jobs"."updated_at" >= "conversation_ai_response_jobs"."created_at" and "conversation_ai_response_jobs"."not_before" >= "conversation_ai_response_jobs"."created_at" and ("conversation_ai_response_jobs"."terminal_at" is null or "conversation_ai_response_jobs"."terminal_at" >= "conversation_ai_response_jobs"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "conversation_ai_control_events" ADD CONSTRAINT "conversation_ai_control_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_ai_controls" ADD CONSTRAINT "conversation_ai_controls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_ai_response_jobs" ADD CONSTRAINT "conversation_ai_response_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_ai_response_jobs" ADD CONSTRAINT "conversation_ai_response_jobs_trigger_message_id_conversation_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_ai_control_events_conversation_idx" ON "conversation_ai_control_events" USING btree ("conversation_id","occurred_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_ai_response_jobs_trigger_uidx" ON "conversation_ai_response_jobs" USING btree ("trigger_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_ai_response_jobs_execution_uidx" ON "conversation_ai_response_jobs" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "conversation_ai_response_jobs_due_idx" ON "conversation_ai_response_jobs" USING btree ("status","not_before","leased_until");--> statement-breakpoint
CREATE INDEX "conversation_ai_response_jobs_conversation_idx" ON "conversation_ai_response_jobs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE FUNCTION "prevent_conversation_ai_control_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "conversations" WHERE "id" = OLD."conversation_id") THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'conversation_ai_control_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "conversation_ai_control_events_append_only_trigger"
	BEFORE UPDATE OR DELETE ON "conversation_ai_control_events"
	FOR EACH ROW EXECUTE FUNCTION "prevent_conversation_ai_control_event_mutation"();
