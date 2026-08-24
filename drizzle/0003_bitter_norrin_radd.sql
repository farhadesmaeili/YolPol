CREATE TABLE "conversation_messages" (
	"id" varchar(160) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(128) NOT NULL,
	"position" integer NOT NULL,
	"sender_type" varchar(20) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_messages_id_format_check" CHECK ("conversation_messages"."id" ~ '^[A-Za-z0-9_-]{1,160}$'),
	CONSTRAINT "conversation_messages_position_check" CHECK ("conversation_messages"."position" >= 0),
	CONSTRAINT "conversation_messages_sender_type_check" CHECK ("conversation_messages"."sender_type" in ('CUSTOMER','INTERNAL_USER','AI_AGENT','SYSTEM')),
	CONSTRAINT "conversation_messages_channel_check" CHECK ("conversation_messages"."channel" in ('WEBSITE','TELEGRAM','EMAIL','WHATSAPP')),
	CONSTRAINT "conversation_messages_body_length_check" CHECK (char_length("conversation_messages"."body") between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"inquiry_id" varchar(128) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversations_id_format_check" CHECK ("conversations"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "conversations_channel_check" CHECK ("conversations"."channel" in ('WEBSITE','TELEGRAM','EMAIL','WHATSAPP'))
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_position_uidx" ON "conversation_messages" USING btree ("conversation_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_inquiry_id_uidx" ON "conversations" USING btree ("inquiry_id");