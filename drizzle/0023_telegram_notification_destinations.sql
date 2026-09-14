CREATE TABLE "communication_recipient_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"recipient_id" varchar(128) NOT NULL,
	"event_type" varchar(48) NOT NULL,
	"destination_kind" varchar(20) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"actor_reference" varchar(160) NOT NULL,
	"actor_display_name" varchar(120) NOT NULL,
	"previous_authorized" boolean NOT NULL,
	"previous_notifications_enabled" boolean NOT NULL,
	"new_authorized" boolean NOT NULL,
	"new_notifications_enabled" boolean NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "communication_recipient_events_id_check" CHECK ("communication_recipient_events"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "communication_recipient_events_kind_check" CHECK ("communication_recipient_events"."destination_kind" in ('TEAM_GROUP','TEAM_MEMBER')),
	CONSTRAINT "communication_recipient_events_type_check" CHECK ("communication_recipient_events"."event_type" in ('TEAM_MEMBER_ENABLED','TEAM_MEMBER_DISABLED','TEAM_MEMBER_LINK_DISCONNECTED','TEAM_GROUP_AUTHORIZED','TEAM_GROUP_ENABLED','TEAM_GROUP_DISABLED','TEAM_GROUP_DISCONNECTED')),
	CONSTRAINT "communication_recipient_events_actor_check" CHECK ("communication_recipient_events"."actor_reference" ~ '^staff:[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "communication_recipient_events_new_state_check" CHECK ("communication_recipient_events"."new_authorized" or not "communication_recipient_events"."new_notifications_enabled")
);
--> statement-breakpoint
CREATE TABLE "telegram_group_connection_requests" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"staff_account_id" varchar(128) NOT NULL,
	"team_member_id" varchar(128) NOT NULL,
	"token_lookup" varchar(64) NOT NULL,
	"token_verification" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "telegram_group_connection_requests_id_check" CHECK ("telegram_group_connection_requests"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "telegram_group_connection_requests_lookup_check" CHECK ("telegram_group_connection_requests"."token_lookup" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "telegram_group_connection_requests_verification_check" CHECK ("telegram_group_connection_requests"."token_verification" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "telegram_group_connection_requests_digest_separation_check" CHECK ("telegram_group_connection_requests"."token_lookup" <> "telegram_group_connection_requests"."token_verification"),
	CONSTRAINT "telegram_group_connection_requests_expiry_check" CHECK ("telegram_group_connection_requests"."expires_at" > "telegram_group_connection_requests"."created_at"),
	CONSTRAINT "telegram_group_connection_requests_terminal_check" CHECK ("telegram_group_connection_requests"."consumed_at" is null or "telegram_group_connection_requests"."revoked_at" is null)
);
--> statement-breakpoint
ALTER TABLE "communication_recipients" DROP CONSTRAINT "communication_recipients_team_member_kind_check";--> statement-breakpoint
ALTER TABLE "communication_recipients" ALTER COLUMN "notifications_enabled" SET DEFAULT false;--> statement-breakpoint
UPDATE "communication_recipients"
SET "notifications_enabled" = false,
	"updated_at" = greatest("updated_at", clock_timestamp())
WHERE "authorized" = false AND "notifications_enabled" = true;--> statement-breakpoint
WITH ranked AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "channel", "team_member_id"
		ORDER BY "authorized" DESC, "updated_at" DESC, "id" DESC
	) AS position
	FROM "communication_recipients"
	WHERE "kind" = 'TEAM_MEMBER' AND "team_member_id" is not null
)
UPDATE "communication_recipients" recipient
SET "team_member_id" = null,
	"authorized" = false,
	"notifications_enabled" = false,
	"updated_at" = greatest(recipient."updated_at", clock_timestamp())
FROM ranked
WHERE recipient."id" = ranked."id" AND ranked.position > 1;--> statement-breakpoint
ALTER TABLE "communication_recipient_events" ADD CONSTRAINT "communication_recipient_events_recipient_id_communication_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."communication_recipients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_group_connection_requests" ADD CONSTRAINT "telegram_group_connection_requests_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_group_connection_requests" ADD CONSTRAINT "telegram_group_connection_requests_team_member_id_inquiry_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."inquiry_team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_recipient_events_time_idx" ON "communication_recipient_events" USING btree ("occurred_at","id");--> statement-breakpoint
CREATE INDEX "communication_recipient_events_recipient_idx" ON "communication_recipient_events" USING btree ("recipient_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_group_connection_requests_lookup_uidx" ON "telegram_group_connection_requests" USING btree ("token_lookup");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_group_connection_requests_outstanding_staff_uidx" ON "telegram_group_connection_requests" USING btree ("staff_account_id") WHERE "telegram_group_connection_requests"."consumed_at" is null and "telegram_group_connection_requests"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "telegram_group_connection_requests_expiry_idx" ON "telegram_group_connection_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_recipients_team_member_uidx" ON "communication_recipients" USING btree ("channel","team_member_id") WHERE "communication_recipients"."kind" = 'TEAM_MEMBER';--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_enabled_authorized_check" CHECK ("communication_recipients"."authorized" or not "communication_recipients"."notifications_enabled");--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_team_member_kind_check" CHECK (("communication_recipients"."kind" = 'TEAM_MEMBER' and "communication_recipients"."team_member_id" is not null) or ("communication_recipients"."kind" = 'TEAM_GROUP' and "communication_recipients"."team_member_id" is null)) NOT VALID;--> statement-breakpoint
CREATE FUNCTION "prevent_communication_recipient_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'communication_recipient_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "communication_recipient_events_append_only_trigger"
	BEFORE UPDATE OR DELETE ON "communication_recipient_events"
	FOR EACH ROW EXECUTE FUNCTION "prevent_communication_recipient_event_mutation"();
