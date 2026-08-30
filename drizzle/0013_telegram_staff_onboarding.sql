CREATE TABLE "telegram_connection_requests" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"staff_account_id" varchar(128) NOT NULL,
	"team_member_id" varchar(128) NOT NULL,
	"token_lookup" varchar(64) NOT NULL,
	"token_verification" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "telegram_connection_requests_id_format_check" CHECK ("telegram_connection_requests"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "telegram_connection_requests_lookup_format_check" CHECK ("telegram_connection_requests"."token_lookup" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "telegram_connection_requests_verification_format_check" CHECK ("telegram_connection_requests"."token_verification" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "telegram_connection_requests_digest_separation_check" CHECK ("telegram_connection_requests"."token_lookup" <> "telegram_connection_requests"."token_verification"),
	CONSTRAINT "telegram_connection_requests_expiration_check" CHECK ("telegram_connection_requests"."expires_at" > "telegram_connection_requests"."created_at"),
	CONSTRAINT "telegram_connection_requests_consumed_check" CHECK ("telegram_connection_requests"."consumed_at" is null or "telegram_connection_requests"."consumed_at" >= "telegram_connection_requests"."created_at"),
	CONSTRAINT "telegram_connection_requests_revoked_check" CHECK ("telegram_connection_requests"."revoked_at" is null or "telegram_connection_requests"."revoked_at" >= "telegram_connection_requests"."created_at"),
	CONSTRAINT "telegram_connection_requests_terminal_state_check" CHECK ("telegram_connection_requests"."consumed_at" is null or "telegram_connection_requests"."revoked_at" is null)
);
--> statement-breakpoint
CREATE TABLE "telegram_staff_links" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"team_member_id" varchar(128) NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"private_chat_id" bigint NOT NULL,
	"first_linked_at" timestamp with time zone NOT NULL,
	"connected_at" timestamp with time zone NOT NULL,
	"disconnected_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "telegram_staff_links_id_format_check" CHECK ("telegram_staff_links"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "telegram_staff_links_user_positive_check" CHECK ("telegram_staff_links"."telegram_user_id" > 0),
	CONSTRAINT "telegram_staff_links_private_chat_positive_check" CHECK ("telegram_staff_links"."private_chat_id" > 0),
	CONSTRAINT "telegram_staff_links_lifecycle_check" CHECK (
    "telegram_staff_links"."connected_at" >= "telegram_staff_links"."first_linked_at"
    and "telegram_staff_links"."updated_at" >= "telegram_staff_links"."connected_at"
    and ("telegram_staff_links"."disconnected_at" is null or ("telegram_staff_links"."disconnected_at" >= "telegram_staff_links"."connected_at" and "telegram_staff_links"."updated_at" >= "telegram_staff_links"."disconnected_at"))
  )
);
--> statement-breakpoint
ALTER TABLE "telegram_connection_requests" ADD CONSTRAINT "telegram_connection_requests_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_connection_requests" ADD CONSTRAINT "telegram_connection_requests_team_member_id_inquiry_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."inquiry_team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_staff_links" ADD CONSTRAINT "telegram_staff_links_team_member_id_inquiry_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."inquiry_team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_connection_requests_token_lookup_uidx" ON "telegram_connection_requests" USING btree ("token_lookup");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_connection_requests_outstanding_staff_uidx" ON "telegram_connection_requests" USING btree ("staff_account_id") WHERE "telegram_connection_requests"."consumed_at" is null and "telegram_connection_requests"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "telegram_connection_requests_owner_idx" ON "telegram_connection_requests" USING btree ("staff_account_id","team_member_id","created_at");--> statement-breakpoint
CREATE INDEX "telegram_connection_requests_expiry_idx" ON "telegram_connection_requests" USING btree ("expires_at") WHERE "telegram_connection_requests"."consumed_at" is null and "telegram_connection_requests"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_staff_links_user_uidx" ON "telegram_staff_links" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_staff_links_active_team_member_uidx" ON "telegram_staff_links" USING btree ("team_member_id") WHERE "telegram_staff_links"."disconnected_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_staff_links_active_private_chat_uidx" ON "telegram_staff_links" USING btree ("private_chat_id") WHERE "telegram_staff_links"."disconnected_at" is null;--> statement-breakpoint
CREATE INDEX "telegram_staff_links_team_member_history_idx" ON "telegram_staff_links" USING btree ("team_member_id","first_linked_at");