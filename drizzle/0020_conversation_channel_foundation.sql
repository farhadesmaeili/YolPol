CREATE TABLE "conversation_channel_bindings" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(128) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"provider_key" varchar(64) NOT NULL,
	"external_account_reference" varchar(160) NOT NULL,
	"external_conversation_reference" varchar(160) NOT NULL,
	"external_participant_reference" varchar(160) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_channel_bindings_id_check" CHECK ("conversation_channel_bindings"."id" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
	CONSTRAINT "conversation_channel_bindings_channel_check" CHECK ("conversation_channel_bindings"."channel" in ('TELEGRAM','INSTAGRAM','EMAIL','WHATSAPP')),
	CONSTRAINT "conversation_channel_bindings_provider_check" CHECK ("conversation_channel_bindings"."provider_key" ~ '^[a-z][a-z0-9_-]{0,63}$'),
	CONSTRAINT "conversation_channel_bindings_external_references_check" CHECK (
    char_length("conversation_channel_bindings"."external_account_reference") between 1 and 160
    and "conversation_channel_bindings"."external_account_reference" !~ U&'[[:space:][:cntrl:]<>\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    and "conversation_channel_bindings"."external_account_reference" !~* '^[a-z][a-z0-9+.-]*://' and
    char_length("conversation_channel_bindings"."external_conversation_reference") between 1 and 160
    and "conversation_channel_bindings"."external_conversation_reference" !~ U&'[[:space:][:cntrl:]<>\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    and "conversation_channel_bindings"."external_conversation_reference" !~* '^[a-z][a-z0-9+.-]*://' and
    char_length("conversation_channel_bindings"."external_participant_reference") between 1 and 160
    and "conversation_channel_bindings"."external_participant_reference" !~ U&'[[:space:][:cntrl:]<>\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    and "conversation_channel_bindings"."external_participant_reference" !~* '^[a-z][a-z0-9+.-]*://'
  ),
	CONSTRAINT "conversation_channel_bindings_timestamps_check" CHECK ("conversation_channel_bindings"."updated_at" >= "conversation_channel_bindings"."created_at")
);
--> statement-breakpoint
CREATE TABLE "conversation_channel_deliveries" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(128) NOT NULL,
	"message_id" varchar(160) NOT NULL,
	"binding_id" varchar(128) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_token" varchar(128),
	"leased_until" timestamp with time zone,
	"provider_message_reference" varchar(160),
	"failure_category" varchar(64),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"terminal_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "conversation_channel_deliveries_id_check" CHECK ("conversation_channel_deliveries"."id" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
	CONSTRAINT "conversation_channel_deliveries_status_check" CHECK ("conversation_channel_deliveries"."status" in ('PENDING','RUNNING','DELIVERED','FAILED','UNKNOWN')),
	CONSTRAINT "conversation_channel_deliveries_attempts_check" CHECK ("conversation_channel_deliveries"."attempts" between 0 and 3 and "conversation_channel_deliveries"."version" >= 1
    and (("conversation_channel_deliveries"."status" = 'PENDING' and "conversation_channel_deliveries"."attempts" < 3) or ("conversation_channel_deliveries"."status" <> 'PENDING' and "conversation_channel_deliveries"."attempts" >= 1))),
	CONSTRAINT "conversation_channel_deliveries_lease_check" CHECK (
    ("conversation_channel_deliveries"."status" = 'RUNNING' and "conversation_channel_deliveries"."lease_token" is not null and "conversation_channel_deliveries"."leased_until" is not null
      and "conversation_channel_deliveries"."lease_token" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' and "conversation_channel_deliveries"."leased_until" > "conversation_channel_deliveries"."updated_at") or
    ("conversation_channel_deliveries"."status" <> 'RUNNING' and "conversation_channel_deliveries"."lease_token" is null and "conversation_channel_deliveries"."leased_until" is null)
  ),
	CONSTRAINT "conversation_channel_deliveries_failure_check" CHECK (
    ("conversation_channel_deliveries"."failure_category" is null or "conversation_channel_deliveries"."failure_category" in
      ('AUTHENTICATION','AUTHORIZATION','DESTINATION_NOT_FOUND','INVALID_REQUEST','RATE_LIMITED','PROVIDER_UNAVAILABLE','TIMEOUT','MALFORMED_RESPONSE','INFRASTRUCTURE_FAILURE','UNKNOWN_OUTCOME'))
    and ("conversation_channel_deliveries"."status" <> 'RUNNING' or "conversation_channel_deliveries"."failure_category" is null)
    and ("conversation_channel_deliveries"."status" = 'UNKNOWN' or "conversation_channel_deliveries"."failure_category" is distinct from 'UNKNOWN_OUTCOME')
  ),
	CONSTRAINT "conversation_channel_deliveries_provider_reference_check" CHECK ("conversation_channel_deliveries"."provider_message_reference" is null or (char_length("conversation_channel_deliveries"."provider_message_reference") between 1 and 160
    and "conversation_channel_deliveries"."provider_message_reference" !~ U&'[[:space:][:cntrl:]<>\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    and "conversation_channel_deliveries"."provider_message_reference" !~* '^[a-z][a-z0-9+.-]*://')),
	CONSTRAINT "conversation_channel_deliveries_outcome_check" CHECK (
    ("conversation_channel_deliveries"."status" = 'DELIVERED' and "conversation_channel_deliveries"."provider_message_reference" is not null and "conversation_channel_deliveries"."delivered_at" is not null and "conversation_channel_deliveries"."terminal_at" is not null and "conversation_channel_deliveries"."failure_category" is null) or
    ("conversation_channel_deliveries"."status" = 'FAILED' and "conversation_channel_deliveries"."provider_message_reference" is null and "conversation_channel_deliveries"."delivered_at" is null and "conversation_channel_deliveries"."terminal_at" is not null and "conversation_channel_deliveries"."failure_category" is not null) or
    ("conversation_channel_deliveries"."status" = 'UNKNOWN' and "conversation_channel_deliveries"."provider_message_reference" is null and "conversation_channel_deliveries"."delivered_at" is null and "conversation_channel_deliveries"."terminal_at" is not null and "conversation_channel_deliveries"."failure_category" is not distinct from 'UNKNOWN_OUTCOME') or
    ("conversation_channel_deliveries"."status" in ('PENDING','RUNNING') and "conversation_channel_deliveries"."provider_message_reference" is null and "conversation_channel_deliveries"."delivered_at" is null and "conversation_channel_deliveries"."terminal_at" is null)
  ),
	CONSTRAINT "conversation_channel_deliveries_timestamps_check" CHECK (
    "conversation_channel_deliveries"."updated_at" >= "conversation_channel_deliveries"."created_at" and "conversation_channel_deliveries"."available_at" >= "conversation_channel_deliveries"."created_at" and
    ("conversation_channel_deliveries"."delivered_at" is null or "conversation_channel_deliveries"."delivered_at" >= "conversation_channel_deliveries"."created_at") and
    ("conversation_channel_deliveries"."terminal_at" is null or "conversation_channel_deliveries"."terminal_at" >= "conversation_channel_deliveries"."created_at")
  )
);
--> statement-breakpoint
CREATE TABLE "conversation_channel_inbound_messages" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"binding_id" varchar(128) NOT NULL,
	"conversation_id" varchar(128) NOT NULL,
	"external_message_reference" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"correlated_message_id" varchar(160),
	"correlated_at" timestamp with time zone,
	CONSTRAINT "conversation_channel_inbound_id_check" CHECK ("conversation_channel_inbound_messages"."id" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
	CONSTRAINT "conversation_channel_inbound_external_reference_check" CHECK (char_length("conversation_channel_inbound_messages"."external_message_reference") between 1 and 160
    and "conversation_channel_inbound_messages"."external_message_reference" !~ U&'[[:space:][:cntrl:]<>\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    and "conversation_channel_inbound_messages"."external_message_reference" !~* '^[a-z][a-z0-9+.-]*://'),
	CONSTRAINT "conversation_channel_inbound_body_check" CHECK (char_length("conversation_channel_inbound_messages"."body") between 1 and 10000
    and "conversation_channel_inbound_messages"."body" ~ U&'[^[:space:]\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]'
    and "conversation_channel_inbound_messages"."body" !~ U&'[\0001-\0008\000B\000C\000E-\001F\007F]'
    and "conversation_channel_inbound_messages"."body" !~* '</?[a-z][^>]*>'),
	CONSTRAINT "conversation_channel_inbound_correlation_check" CHECK (
    ("conversation_channel_inbound_messages"."correlated_message_id" is null and "conversation_channel_inbound_messages"."correlated_at" is null) or
    ("conversation_channel_inbound_messages"."correlated_message_id" is not null and "conversation_channel_inbound_messages"."correlated_at" is not null and "conversation_channel_inbound_messages"."correlated_at" >= "conversation_channel_inbound_messages"."received_at")
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_channel_bindings_id_conversation_uidx" ON "conversation_channel_bindings" USING btree ("id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_id_conversation_uidx" ON "conversation_messages" USING btree ("id","conversation_id");--> statement-breakpoint
ALTER TABLE "conversation_channel_bindings" ADD CONSTRAINT "conversation_channel_bindings_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_channel_deliveries" ADD CONSTRAINT "conversation_channel_deliveries_message_fk" FOREIGN KEY ("message_id","conversation_id") REFERENCES "public"."conversation_messages"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_channel_deliveries" ADD CONSTRAINT "conversation_channel_deliveries_binding_fk" FOREIGN KEY ("binding_id","conversation_id") REFERENCES "public"."conversation_channel_bindings"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_channel_inbound_messages" ADD CONSTRAINT "conversation_channel_inbound_binding_fk" FOREIGN KEY ("binding_id","conversation_id") REFERENCES "public"."conversation_channel_bindings"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_channel_inbound_messages" ADD CONSTRAINT "conversation_channel_inbound_message_fk" FOREIGN KEY ("correlated_message_id","conversation_id") REFERENCES "public"."conversation_messages"("id","conversation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_channel_bindings_external_conversation_uidx" ON "conversation_channel_bindings" USING btree ("channel","provider_key","external_account_reference","external_conversation_reference");--> statement-breakpoint
CREATE INDEX "conversation_channel_bindings_conversation_idx" ON "conversation_channel_bindings" USING btree ("conversation_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_channel_deliveries_message_binding_uidx" ON "conversation_channel_deliveries" USING btree ("message_id","binding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_channel_deliveries_provider_message_uidx" ON "conversation_channel_deliveries" USING btree ("binding_id","provider_message_reference") WHERE "conversation_channel_deliveries"."provider_message_reference" is not null;--> statement-breakpoint
CREATE INDEX "conversation_channel_deliveries_due_idx" ON "conversation_channel_deliveries" USING btree ("status","available_at","leased_until");--> statement-breakpoint
CREATE INDEX "conversation_channel_deliveries_conversation_idx" ON "conversation_channel_deliveries" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_channel_inbound_external_message_uidx" ON "conversation_channel_inbound_messages" USING btree ("binding_id","external_message_reference");--> statement-breakpoint
CREATE INDEX "conversation_channel_inbound_conversation_idx" ON "conversation_channel_inbound_messages" USING btree ("conversation_id","received_at");
