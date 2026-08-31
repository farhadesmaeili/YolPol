CREATE TABLE "ai_operation_policy" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"mode" varchar(16) NOT NULL,
	"business_time_zone" varchar(64) NOT NULL,
	"human_grace_period_seconds" integer NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" varchar(160) NOT NULL,
	CONSTRAINT "ai_operation_policy_singleton_check" CHECK ("ai_operation_policy"."id" = 'global'),
	CONSTRAINT "ai_operation_policy_mode_check" CHECK ("ai_operation_policy"."mode" in ('DISABLED','FALLBACK','SCHEDULED')),
	CONSTRAINT "ai_operation_policy_grace_check" CHECK ("ai_operation_policy"."human_grace_period_seconds" between 60 and 86400),
	CONSTRAINT "ai_operation_policy_version_check" CHECK ("ai_operation_policy"."version" >= 1),
	CONSTRAINT "ai_operation_policy_actor_check" CHECK ("ai_operation_policy"."updated_by" ~ '^staff:[A-Za-z0-9_-]{1,128}$')
);
--> statement-breakpoint
CREATE TABLE "ai_policy_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"previous_version" integer,
	"new_version" integer NOT NULL,
	"actor_reference" varchar(160) NOT NULL,
	"previous_policy" jsonb,
	"new_policy" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_policy_events_id_format_check" CHECK ("ai_policy_events"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "ai_policy_events_type_check" CHECK ("ai_policy_events"."event_type" in ('POLICY_CREATED','POLICY_UPDATED')),
	CONSTRAINT "ai_policy_events_versions_check" CHECK ("ai_policy_events"."new_version" >= 1 and ("ai_policy_events"."previous_version" is null or "ai_policy_events"."previous_version" >= 1 and "ai_policy_events"."new_version" = "ai_policy_events"."previous_version" + 1)),
	CONSTRAINT "ai_policy_events_actor_check" CHECK ("ai_policy_events"."actor_reference" ~ '^staff:[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "ai_policy_events_creation_shape_check" CHECK (("ai_policy_events"."event_type" = 'POLICY_CREATED' and "ai_policy_events"."previous_version" is null and "ai_policy_events"."previous_policy" is null) or ("ai_policy_events"."event_type" = 'POLICY_UPDATED' and "ai_policy_events"."previous_version" is not null and "ai_policy_events"."previous_policy" is not null))
);
--> statement-breakpoint
CREATE TABLE "ai_schedule_windows" (
	"policy_id" varchar(32) NOT NULL,
	"position" integer NOT NULL,
	"weekday" varchar(9) NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "ai_schedule_windows_pkey" PRIMARY KEY("policy_id","position"),
	CONSTRAINT "ai_schedule_windows_position_check" CHECK ("ai_schedule_windows"."position" >= 0 and "ai_schedule_windows"."position" < 64),
	CONSTRAINT "ai_schedule_windows_weekday_check" CHECK ("ai_schedule_windows"."weekday" in ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY')),
	CONSTRAINT "ai_schedule_windows_minutes_check" CHECK ("ai_schedule_windows"."start_minute" >= 0 and "ai_schedule_windows"."start_minute" <= 1439 and "ai_schedule_windows"."end_minute" >= 1 and "ai_schedule_windows"."end_minute" <= 1440 and "ai_schedule_windows"."start_minute" < "ai_schedule_windows"."end_minute")
);
--> statement-breakpoint
ALTER TABLE "ai_schedule_windows" ADD CONSTRAINT "ai_schedule_windows_policy_id_ai_operation_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."ai_operation_policy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_policy_events_occurred_at_idx" ON "ai_policy_events" USING btree ("occurred_at","id");--> statement-breakpoint
CREATE FUNCTION "prevent_ai_policy_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'ai_policy_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ai_policy_events_append_only_trigger"
	BEFORE UPDATE OR DELETE ON "ai_policy_events"
	FOR EACH ROW EXECUTE FUNCTION "prevent_ai_policy_event_mutation"();
