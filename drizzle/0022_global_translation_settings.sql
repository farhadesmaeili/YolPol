CREATE TABLE "global_translation_setting_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"settings_id" varchar(32) NOT NULL,
	"previous_customer_to_staff_mode" varchar(16) NOT NULL,
	"new_customer_to_staff_mode" varchar(16) NOT NULL,
	"previous_staff_to_customer_mode" varchar(16) NOT NULL,
	"new_staff_to_customer_mode" varchar(16) NOT NULL,
	"previous_ai_to_staff_mode" varchar(16) NOT NULL,
	"new_ai_to_staff_mode" varchar(16) NOT NULL,
	"previous_version" integer NOT NULL,
	"new_version" integer NOT NULL,
	"actor_reference" varchar(166) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "global_translation_setting_events_id_check" CHECK ("global_translation_setting_events"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "global_translation_setting_events_customer_staff_check" CHECK ("global_translation_setting_events"."previous_customer_to_staff_mode" in ('AUTO','MANUAL') and "global_translation_setting_events"."new_customer_to_staff_mode" in ('AUTO','MANUAL')),
	CONSTRAINT "global_translation_setting_events_staff_customer_check" CHECK ("global_translation_setting_events"."previous_staff_to_customer_mode" in ('AUTO','MANUAL') and "global_translation_setting_events"."new_staff_to_customer_mode" in ('AUTO','MANUAL')),
	CONSTRAINT "global_translation_setting_events_ai_staff_check" CHECK ("global_translation_setting_events"."previous_ai_to_staff_mode" in ('AUTO','ON_DEMAND') and "global_translation_setting_events"."new_ai_to_staff_mode" in ('AUTO','ON_DEMAND')),
	CONSTRAINT "global_translation_setting_events_changed_check" CHECK ("global_translation_setting_events"."previous_customer_to_staff_mode" <> "global_translation_setting_events"."new_customer_to_staff_mode" or "global_translation_setting_events"."previous_staff_to_customer_mode" <> "global_translation_setting_events"."new_staff_to_customer_mode" or "global_translation_setting_events"."previous_ai_to_staff_mode" <> "global_translation_setting_events"."new_ai_to_staff_mode"),
	CONSTRAINT "global_translation_setting_events_version_check" CHECK ("global_translation_setting_events"."previous_version" >= 0 and "global_translation_setting_events"."new_version" = "global_translation_setting_events"."previous_version" + 1),
	CONSTRAINT "global_translation_setting_events_actor_check" CHECK ("global_translation_setting_events"."actor_reference" ~ '^staff:[A-Za-z0-9_-]{1,160}$')
);
--> statement-breakpoint
CREATE TABLE "global_translation_settings" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"customer_to_staff_mode" varchar(16) DEFAULT 'AUTO' NOT NULL,
	"staff_to_customer_mode" varchar(16) DEFAULT 'AUTO' NOT NULL,
	"ai_to_staff_mode" varchar(16) DEFAULT 'ON_DEMAND' NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" varchar(166) NOT NULL,
	CONSTRAINT "global_translation_settings_singleton_check" CHECK ("global_translation_settings"."id" = 'GLOBAL'),
	CONSTRAINT "global_translation_settings_customer_staff_check" CHECK ("global_translation_settings"."customer_to_staff_mode" in ('AUTO','MANUAL')),
	CONSTRAINT "global_translation_settings_staff_customer_check" CHECK ("global_translation_settings"."staff_to_customer_mode" in ('AUTO','MANUAL')),
	CONSTRAINT "global_translation_settings_ai_staff_check" CHECK ("global_translation_settings"."ai_to_staff_mode" in ('AUTO','ON_DEMAND')),
	CONSTRAINT "global_translation_settings_version_check" CHECK ("global_translation_settings"."version" >= 1),
	CONSTRAINT "global_translation_settings_actor_check" CHECK ("global_translation_settings"."updated_by" ~ '^staff:[A-Za-z0-9_-]{1,160}$')
);
--> statement-breakpoint
ALTER TABLE "conversation_translation_control_events" DROP CONSTRAINT "conversation_translation_control_events_changed_check";--> statement-breakpoint
ALTER TABLE "conversation_translation_control_events" ADD COLUMN "operation" varchar(16) DEFAULT 'SET' NOT NULL;--> statement-breakpoint
ALTER TABLE "global_translation_setting_events" ADD CONSTRAINT "global_translation_setting_events_settings_id_global_translation_settings_id_fk" FOREIGN KEY ("settings_id") REFERENCES "public"."global_translation_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "global_translation_setting_events_occurred_idx" ON "global_translation_setting_events" USING btree ("occurred_at","id");--> statement-breakpoint
ALTER TABLE "conversation_translation_control_events" ADD CONSTRAINT "conversation_translation_control_events_operation_check" CHECK ("conversation_translation_control_events"."operation" in ('SET','REMOVE'));--> statement-breakpoint
ALTER TABLE "conversation_translation_control_events" ADD CONSTRAINT "conversation_translation_control_events_changed_check" CHECK ("conversation_translation_control_events"."operation" = 'REMOVE' or "conversation_translation_control_events"."previous_version" = 0 or "conversation_translation_control_events"."previous_customer_to_staff_mode" <> "conversation_translation_control_events"."new_customer_to_staff_mode" or "conversation_translation_control_events"."previous_staff_to_customer_mode" <> "conversation_translation_control_events"."new_staff_to_customer_mode" or "conversation_translation_control_events"."previous_ai_to_staff_mode" <> "conversation_translation_control_events"."new_ai_to_staff_mode");
--> statement-breakpoint
CREATE FUNCTION "prevent_global_translation_setting_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'global_translation_setting_events is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "global_translation_setting_events_append_only_trigger"
	BEFORE UPDATE OR DELETE ON "global_translation_setting_events"
	FOR EACH ROW EXECUTE FUNCTION "prevent_global_translation_setting_event_mutation"();
