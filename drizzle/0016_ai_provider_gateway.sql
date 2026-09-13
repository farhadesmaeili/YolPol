CREATE TABLE "ai_provider_runtime_health" (
	"provider_configuration_id" varchar(64) NOT NULL,
	"model_profile_id" varchar(64) NOT NULL,
	"credential_reference_id" varchar(64) NOT NULL,
	"state" varchar(16) NOT NULL,
	"consecutive_failures" integer NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"open_until" timestamp with time zone,
	"half_open_lease_until" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "ai_provider_runtime_health_pkey" PRIMARY KEY("provider_configuration_id","model_profile_id","credential_reference_id"),
	CONSTRAINT "ai_provider_runtime_health_state_check" CHECK ("ai_provider_runtime_health"."state" in ('CLOSED','OPEN','HALF_OPEN')),
	CONSTRAINT "ai_provider_runtime_health_failures_check" CHECK ("ai_provider_runtime_health"."consecutive_failures" between 0 and 1000000),
	CONSTRAINT "ai_provider_runtime_health_version_check" CHECK ("ai_provider_runtime_health"."version" >= 1),
	CONSTRAINT "ai_provider_runtime_health_state_metadata_check" CHECK (
    ("ai_provider_runtime_health"."state" = 'CLOSED' and "ai_provider_runtime_health"."open_until" is null and "ai_provider_runtime_health"."half_open_lease_until" is null)
    or ("ai_provider_runtime_health"."state" = 'OPEN' and "ai_provider_runtime_health"."open_until" is not null and "ai_provider_runtime_health"."half_open_lease_until" is null)
    or ("ai_provider_runtime_health"."state" = 'HALF_OPEN' and "ai_provider_runtime_health"."open_until" is not null and "ai_provider_runtime_health"."half_open_lease_until" is not null)
  )
);
--> statement-breakpoint
ALTER TABLE "ai_provider_runtime_health" ADD CONSTRAINT "ai_provider_runtime_health_provider_configuration_id_ai_provider_configs_id_fk" FOREIGN KEY ("provider_configuration_id") REFERENCES "public"."ai_provider_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_runtime_health" ADD CONSTRAINT "ai_provider_runtime_health_model_profile_id_ai_model_profiles_id_fk" FOREIGN KEY ("model_profile_id") REFERENCES "public"."ai_model_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_runtime_health" ADD CONSTRAINT "ai_provider_runtime_health_credential_reference_id_ai_credential_references_id_fk" FOREIGN KEY ("credential_reference_id") REFERENCES "public"."ai_credential_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_provider_runtime_health_open_idx" ON "ai_provider_runtime_health" USING btree ("state","open_until");--> statement-breakpoint
CREATE INDEX "ai_provider_runtime_health_updated_idx" ON "ai_provider_runtime_health" USING btree ("updated_at");