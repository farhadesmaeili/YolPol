CREATE TABLE "staff_accounts" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"team_member_id" varchar(128) NOT NULL,
	"normalized_email" varchar(254) NOT NULL,
	"password_hash" varchar(512) NOT NULL,
	"role" varchar(16) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "staff_accounts_id_format_check" CHECK ("staff_accounts"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "staff_accounts_email_check" CHECK (char_length("staff_accounts"."normalized_email") between 3 and 254 and "staff_accounts"."normalized_email" = lower(btrim("staff_accounts"."normalized_email")) and "staff_accounts"."normalized_email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
	CONSTRAINT "staff_accounts_password_hash_check" CHECK (char_length("staff_accounts"."password_hash") between 1 and 512 and "staff_accounts"."password_hash" !~ '[[:cntrl:]]'),
	CONSTRAINT "staff_accounts_role_check" CHECK ("staff_accounts"."role" in ('ADMIN','SALES')),
	CONSTRAINT "staff_accounts_timestamps_check" CHECK ("staff_accounts"."updated_at" >= "staff_accounts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"staff_account_id" varchar(128) NOT NULL,
	"token_lookup" varchar(64) NOT NULL,
	"token_verification" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "staff_sessions_id_format_check" CHECK ("staff_sessions"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "staff_sessions_token_lookup_format_check" CHECK ("staff_sessions"."token_lookup" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "staff_sessions_token_verification_format_check" CHECK ("staff_sessions"."token_verification" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "staff_sessions_expiration_check" CHECK ("staff_sessions"."expires_at" > "staff_sessions"."created_at"),
	CONSTRAINT "staff_sessions_revocation_check" CHECK ("staff_sessions"."revoked_at" is null or "staff_sessions"."revoked_at" >= "staff_sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_team_member_id_inquiry_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."inquiry_team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_accounts_team_member_uidx" ON "staff_accounts" USING btree ("team_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_accounts_normalized_email_uidx" ON "staff_accounts" USING btree ("normalized_email");--> statement-breakpoint
CREATE INDEX "staff_accounts_active_idx" ON "staff_accounts" USING btree ("active","id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_sessions_token_lookup_uidx" ON "staff_sessions" USING btree ("token_lookup");--> statement-breakpoint
CREATE INDEX "staff_sessions_account_idx" ON "staff_sessions" USING btree ("staff_account_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_sessions_active_expiry_idx" ON "staff_sessions" USING btree ("expires_at") WHERE "staff_sessions"."revoked_at" is null;
