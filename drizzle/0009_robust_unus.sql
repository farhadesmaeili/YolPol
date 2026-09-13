CREATE TABLE "telegram_inquiry_deliveries" (
	"outbox_event_id" varchar(160) NOT NULL,
	"recipient_id" varchar(128) NOT NULL,
	"conversation_id" varchar(128) NOT NULL,
	"recipient_kind" varchar(20) NOT NULL,
	"recipient_external_id" varchar(160) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"telegram_chat_id" bigint,
	"telegram_message_id" bigint,
	"last_error_code" varchar(64),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "telegram_inquiry_deliveries_pkey" PRIMARY KEY("outbox_event_id","recipient_id"),
	CONSTRAINT "telegram_inquiry_deliveries_recipient_kind_check" CHECK ("telegram_inquiry_deliveries"."recipient_kind" in ('TEAM_GROUP','TEAM_MEMBER')),
	CONSTRAINT "telegram_inquiry_deliveries_status_check" CHECK ("telegram_inquiry_deliveries"."status" in ('PENDING','IN_FLIGHT','RETRYABLE_FAILURE','DELIVERED','PERMANENT_FAILURE','UNKNOWN')),
	CONSTRAINT "telegram_inquiry_deliveries_attempts_check" CHECK ("telegram_inquiry_deliveries"."attempts" >= 0),
	CONSTRAINT "telegram_inquiry_deliveries_external_id_check" CHECK (char_length("telegram_inquiry_deliveries"."recipient_external_id") between 1 and 160),
	CONSTRAINT "telegram_inquiry_deliveries_confirmation_check" CHECK (
    ("telegram_inquiry_deliveries"."status" = 'DELIVERED' and "telegram_inquiry_deliveries"."telegram_chat_id" is not null and "telegram_inquiry_deliveries"."telegram_message_id" is not null and "telegram_inquiry_deliveries"."delivered_at" is not null) or
    ("telegram_inquiry_deliveries"."status" <> 'DELIVERED' and "telegram_inquiry_deliveries"."telegram_chat_id" is null and "telegram_inquiry_deliveries"."telegram_message_id" is null and "telegram_inquiry_deliveries"."delivered_at" is null)
  ),
	CONSTRAINT "telegram_inquiry_deliveries_timestamps_check" CHECK ("telegram_inquiry_deliveries"."updated_at" >= "telegram_inquiry_deliveries"."created_at" and ("telegram_inquiry_deliveries"."delivered_at" is null or "telegram_inquiry_deliveries"."delivered_at" >= "telegram_inquiry_deliveries"."created_at"))
);
--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD COLUMN "team_member_id" varchar(128);--> statement-breakpoint
ALTER TABLE "telegram_inquiry_deliveries" ADD CONSTRAINT "telegram_inquiry_deliveries_outbox_event_id_inquiry_outbox_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."inquiry_outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_inquiry_deliveries" ADD CONSTRAINT "telegram_inquiry_deliveries_recipient_id_communication_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."communication_recipients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_inquiry_deliveries" ADD CONSTRAINT "telegram_inquiry_deliveries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_inquiry_deliveries_provider_binding_uidx" ON "telegram_inquiry_deliveries" USING btree ("telegram_chat_id","telegram_message_id") WHERE "telegram_inquiry_deliveries"."telegram_chat_id" is not null and "telegram_inquiry_deliveries"."telegram_message_id" is not null;--> statement-breakpoint
CREATE INDEX "telegram_inquiry_deliveries_due_idx" ON "telegram_inquiry_deliveries" USING btree ("status","available_at","locked_until");--> statement-breakpoint
CREATE INDEX "telegram_inquiry_deliveries_event_status_idx" ON "telegram_inquiry_deliveries" USING btree ("outbox_event_id","status");--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_team_member_id_inquiry_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."inquiry_team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_team_member_kind_check" CHECK ("communication_recipients"."kind" = 'TEAM_MEMBER' or "communication_recipients"."team_member_id" is null);