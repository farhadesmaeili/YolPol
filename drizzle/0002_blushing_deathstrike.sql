CREATE TABLE "inquiry_outbox" (
	"id" varchar(160) PRIMARY KEY NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"aggregate_id" varchar(128) NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"processed_at" timestamp with time zone,
	CONSTRAINT "inquiry_outbox_event_type_check" CHECK ("inquiry_outbox"."event_type" = 'InquiryCreated'),
	CONSTRAINT "inquiry_outbox_attempts_check" CHECK ("inquiry_outbox"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inquiry_outbox" ADD CONSTRAINT "inquiry_outbox_aggregate_id_inquiries_id_fk" FOREIGN KEY ("aggregate_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiry_outbox_pending_idx" ON "inquiry_outbox" USING btree ("available_at","occurred_at") WHERE "inquiry_outbox"."processed_at" is null;