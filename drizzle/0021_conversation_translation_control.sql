CREATE TABLE "conversation_translation_control_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(128) NOT NULL,
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
	CONSTRAINT "conversation_translation_control_events_id_check" CHECK ("conversation_translation_control_events"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "conversation_translation_control_events_customer_staff_check" CHECK ("conversation_translation_control_events"."previous_customer_to_staff_mode" in ('AUTO','MANUAL') and "conversation_translation_control_events"."new_customer_to_staff_mode" in ('AUTO','MANUAL')),
	CONSTRAINT "conversation_translation_control_events_staff_customer_check" CHECK ("conversation_translation_control_events"."previous_staff_to_customer_mode" in ('AUTO','MANUAL') and "conversation_translation_control_events"."new_staff_to_customer_mode" in ('AUTO','MANUAL')),
	CONSTRAINT "conversation_translation_control_events_ai_staff_check" CHECK ("conversation_translation_control_events"."previous_ai_to_staff_mode" in ('AUTO','ON_DEMAND') and "conversation_translation_control_events"."new_ai_to_staff_mode" in ('AUTO','ON_DEMAND')),
	CONSTRAINT "conversation_translation_control_events_changed_check" CHECK ("conversation_translation_control_events"."previous_customer_to_staff_mode" <> "conversation_translation_control_events"."new_customer_to_staff_mode" or "conversation_translation_control_events"."previous_staff_to_customer_mode" <> "conversation_translation_control_events"."new_staff_to_customer_mode" or "conversation_translation_control_events"."previous_ai_to_staff_mode" <> "conversation_translation_control_events"."new_ai_to_staff_mode"),
	CONSTRAINT "conversation_translation_control_events_version_check" CHECK ("conversation_translation_control_events"."previous_version" >= 0 and "conversation_translation_control_events"."new_version" = "conversation_translation_control_events"."previous_version" + 1),
	CONSTRAINT "conversation_translation_control_events_actor_check" CHECK ("conversation_translation_control_events"."actor_reference" ~ '^staff:[A-Za-z0-9_-]{1,160}$')
);
--> statement-breakpoint
CREATE TABLE "conversation_translation_controls" (
	"conversation_id" varchar(128) PRIMARY KEY NOT NULL,
	"customer_to_staff_mode" varchar(16) DEFAULT 'AUTO' NOT NULL,
	"staff_to_customer_mode" varchar(16) DEFAULT 'AUTO' NOT NULL,
	"ai_to_staff_mode" varchar(16) DEFAULT 'AUTO' NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" varchar(166) NOT NULL,
	CONSTRAINT "conversation_translation_controls_customer_staff_check" CHECK ("conversation_translation_controls"."customer_to_staff_mode" in ('AUTO','MANUAL')),
	CONSTRAINT "conversation_translation_controls_staff_customer_check" CHECK ("conversation_translation_controls"."staff_to_customer_mode" in ('AUTO','MANUAL')),
	CONSTRAINT "conversation_translation_controls_ai_staff_check" CHECK ("conversation_translation_controls"."ai_to_staff_mode" in ('AUTO','ON_DEMAND')),
	CONSTRAINT "conversation_translation_controls_version_check" CHECK ("conversation_translation_controls"."version" >= 1),
	CONSTRAINT "conversation_translation_controls_actor_check" CHECK ("conversation_translation_controls"."updated_by" ~ '^staff:[A-Za-z0-9_-]{1,160}$')
);
--> statement-breakpoint
ALTER TABLE "conversation_translation_events" DROP CONSTRAINT "translation_event_action_check";--> statement-breakpoint
ALTER TABLE "conversation_translation_control_events" ADD CONSTRAINT "conversation_translation_control_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_translation_controls" ADD CONSTRAINT "conversation_translation_controls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_translation_control_events_conversation_idx" ON "conversation_translation_control_events" USING btree ("conversation_id","occurred_at","id");--> statement-breakpoint
ALTER TABLE "conversation_translation_events" ADD CONSTRAINT "translation_event_action_check" CHECK ("conversation_translation_events"."action" in ('REQUEST','RETRY','SKIP','CONFIRM_LANGUAGE'));
--> statement-breakpoint
CREATE FUNCTION "prevent_translation_control_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "conversations" WHERE "id" = OLD."conversation_id") THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'conversation_translation_control_events is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "translation_control_events_append_only_trigger"
	BEFORE UPDATE OR DELETE ON "conversation_translation_control_events"
	FOR EACH ROW EXECUTE FUNCTION "prevent_translation_control_event_mutation"();
