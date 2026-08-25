CREATE TABLE "conversation_access" (
	"conversation_id" varchar(128) PRIMARY KEY NOT NULL,
	"token_lookup" varchar(64) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "conversation_access_token_lookup_format_check" CHECK ("conversation_access"."token_lookup" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "conversation_access_token_hash_format_check" CHECK ("conversation_access"."token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "conversation_access_expiration_check" CHECK ("conversation_access"."expires_at" is null or "conversation_access"."expires_at" > "conversation_access"."created_at")
);
--> statement-breakpoint
ALTER TABLE "conversation_access" ADD CONSTRAINT "conversation_access_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_access_token_lookup_uidx" ON "conversation_access" USING btree ("token_lookup");
