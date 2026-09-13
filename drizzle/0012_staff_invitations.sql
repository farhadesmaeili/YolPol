CREATE TABLE "staff_invitations" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"normalized_email" varchar(254) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"target_role" varchar(16) NOT NULL,
	"token_lookup" varchar(64) NOT NULL,
	"token_verification" varchar(64) NOT NULL,
	"created_by_staff_account_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "staff_invitations_id_format_check" CHECK ("staff_invitations"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "staff_invitations_email_check" CHECK (char_length("staff_invitations"."normalized_email") between 3 and 254 and "staff_invitations"."normalized_email" = lower(btrim("staff_invitations"."normalized_email")) and "staff_invitations"."normalized_email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
	CONSTRAINT "staff_invitations_display_name_check" CHECK (char_length("staff_invitations"."display_name") between 1 and 120 and "staff_invitations"."display_name" = btrim("staff_invitations"."display_name") and "staff_invitations"."display_name" !~ '[[:cntrl:]]'),
	CONSTRAINT "staff_invitations_target_role_check" CHECK ("staff_invitations"."target_role" in ('ADMIN','SALES','VIEWER')),
	CONSTRAINT "staff_invitations_token_lookup_format_check" CHECK ("staff_invitations"."token_lookup" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "staff_invitations_token_verification_format_check" CHECK ("staff_invitations"."token_verification" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "staff_invitations_expiration_check" CHECK ("staff_invitations"."expires_at" > "staff_invitations"."created_at"),
	CONSTRAINT "staff_invitations_consumed_check" CHECK ("staff_invitations"."consumed_at" is null or "staff_invitations"."consumed_at" >= "staff_invitations"."created_at"),
	CONSTRAINT "staff_invitations_revoked_check" CHECK ("staff_invitations"."revoked_at" is null or "staff_invitations"."revoked_at" >= "staff_invitations"."created_at"),
	CONSTRAINT "staff_invitations_terminal_state_check" CHECK ("staff_invitations"."consumed_at" is null or "staff_invitations"."revoked_at" is null)
);
--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_created_by_staff_account_id_staff_accounts_id_fk" FOREIGN KEY ("created_by_staff_account_id") REFERENCES "public"."staff_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_token_lookup_uidx" ON "staff_invitations" USING btree ("token_lookup");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invitations_outstanding_email_uidx" ON "staff_invitations" USING btree ("normalized_email") WHERE "staff_invitations"."consumed_at" is null and "staff_invitations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "staff_invitations_expiry_idx" ON "staff_invitations" USING btree ("expires_at") WHERE "staff_invitations"."consumed_at" is null and "staff_invitations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "staff_invitations_creator_idx" ON "staff_invitations" USING btree ("created_by_staff_account_id","created_at");