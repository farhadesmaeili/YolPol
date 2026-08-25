CREATE TABLE "communication_recipients" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"channel" varchar(20) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"external_id" varchar(160) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"authorized" boolean DEFAULT false NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "communication_recipients_id_format_check" CHECK ("communication_recipients"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "communication_recipients_channel_check" CHECK ("communication_recipients"."channel" in ('TELEGRAM','EMAIL','WHATSAPP')),
	CONSTRAINT "communication_recipients_kind_check" CHECK ("communication_recipients"."kind" in ('TEAM_GROUP','TEAM_MEMBER')),
	CONSTRAINT "communication_recipients_external_id_length_check" CHECK (char_length("communication_recipients"."external_id") between 1 and 160),
	CONSTRAINT "communication_recipients_display_name_length_check" CHECK (char_length("communication_recipients"."display_name") between 1 and 120),
	CONSTRAINT "communication_recipients_timestamps_check" CHECK ("communication_recipients"."updated_at" >= "communication_recipients"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "communication_recipients_channel_external_uidx" ON "communication_recipients" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "communication_recipients_notifications_idx" ON "communication_recipients" USING btree ("channel","authorized","notifications_enabled");