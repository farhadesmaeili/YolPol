CREATE TABLE "ai_credential_references" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"alias" varchar(120) NOT NULL,
	"credential_reference" varchar(128) NOT NULL,
	"enabled" boolean NOT NULL,
	"priority" integer NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" varchar(160) NOT NULL,
	CONSTRAINT "ai_credential_references_id_check" CHECK ("ai_credential_references"."id" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "ai_credential_references_alias_check" CHECK (length(btrim("ai_credential_references"."alias")) between 1 and 120 and "ai_credential_references"."alias" !~ '[<>]'),
	CONSTRAINT "ai_credential_references_reference_check" CHECK ("ai_credential_references"."credential_reference" ~ '^(?:[a-z][a-z0-9-]{1,63}|secret://[a-z][a-z0-9-]{1,31}(?:/[a-z0-9][a-z0-9-]{0,31}){1,4})$'),
	CONSTRAINT "ai_credential_references_priority_check" CHECK ("ai_credential_references"."priority" between 0 and 1000000),
	CONSTRAINT "ai_credential_references_version_check" CHECK ("ai_credential_references"."version" >= 1),
	CONSTRAINT "ai_credential_references_time_check" CHECK ("ai_credential_references"."updated_at" >= "ai_credential_references"."created_at"),
	CONSTRAINT "ai_credential_references_actor_check" CHECK ("ai_credential_references"."updated_by" ~ '^staff:[A-Za-z0-9_-]{1,128}$')
);
--> statement-breakpoint
CREATE TABLE "ai_model_profile_capabilities" (
	"profile_id" varchar(64) NOT NULL,
	"capability" varchar(32) NOT NULL,
	CONSTRAINT "ai_model_profile_capabilities_pkey" PRIMARY KEY("profile_id","capability"),
	CONSTRAINT "ai_model_profile_capabilities_value_check" CHECK ("ai_model_profile_capabilities"."capability" in ('TEXT_GENERATION','TRANSLATION','STRUCTURED_OUTPUT','TOOL_CALLING'))
);
--> statement-breakpoint
CREATE TABLE "ai_model_profiles" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"model_identifier" varchar(160) NOT NULL,
	"enabled" boolean NOT NULL,
	"priority" integer NOT NULL,
	"temperature" double precision,
	"top_p" double precision,
	"max_output_tokens" integer NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" varchar(160) NOT NULL,
	CONSTRAINT "ai_model_profiles_id_check" CHECK ("ai_model_profiles"."id" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "ai_model_profiles_name_check" CHECK (length(btrim("ai_model_profiles"."name")) between 1 and 120 and "ai_model_profiles"."name" !~ '[<>]'),
	CONSTRAINT "ai_model_profiles_model_id_check" CHECK ("ai_model_profiles"."model_identifier" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$'),
	CONSTRAINT "ai_model_profiles_priority_check" CHECK ("ai_model_profiles"."priority" between 0 and 1000000),
	CONSTRAINT "ai_model_profiles_temperature_check" CHECK ("ai_model_profiles"."temperature" is null or "ai_model_profiles"."temperature" between 0 and 2),
	CONSTRAINT "ai_model_profiles_top_p_check" CHECK ("ai_model_profiles"."top_p" is null or "ai_model_profiles"."top_p" between 0 and 1),
	CONSTRAINT "ai_model_profiles_output_tokens_check" CHECK ("ai_model_profiles"."max_output_tokens" between 1 and 131072),
	CONSTRAINT "ai_model_profiles_version_check" CHECK ("ai_model_profiles"."version" >= 1),
	CONSTRAINT "ai_model_profiles_time_check" CHECK ("ai_model_profiles"."updated_at" >= "ai_model_profiles"."created_at"),
	CONSTRAINT "ai_model_profiles_actor_check" CHECK ("ai_model_profiles"."updated_by" ~ '^staff:[A-Za-z0-9_-]{1,128}$')
);
--> statement-breakpoint
CREATE TABLE "ai_provider_configs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"adapter_key" varchar(48) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"enabled" boolean NOT NULL,
	"priority" integer NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" varchar(160) NOT NULL,
	CONSTRAINT "ai_provider_configs_id_check" CHECK ("ai_provider_configs"."id" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
	CONSTRAINT "ai_provider_configs_adapter_key_check" CHECK ("ai_provider_configs"."adapter_key" ~ '^[a-z][a-z0-9-]{0,47}$'),
	CONSTRAINT "ai_provider_configs_display_name_check" CHECK (length(btrim("ai_provider_configs"."display_name")) between 1 and 120 and "ai_provider_configs"."display_name" !~ '[<>]'),
	CONSTRAINT "ai_provider_configs_priority_check" CHECK ("ai_provider_configs"."priority" between 0 and 1000000),
	CONSTRAINT "ai_provider_configs_version_check" CHECK ("ai_provider_configs"."version" >= 1),
	CONSTRAINT "ai_provider_configs_time_check" CHECK ("ai_provider_configs"."updated_at" >= "ai_provider_configs"."created_at"),
	CONSTRAINT "ai_provider_configs_actor_check" CHECK ("ai_provider_configs"."updated_by" ~ '^staff:[A-Za-z0-9_-]{1,128}$')
);
--> statement-breakpoint
CREATE TABLE "ai_provider_registry_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"change_type" varchar(16) NOT NULL,
	"previous_version" integer,
	"new_version" integer NOT NULL,
	"actor_reference" varchar(160) NOT NULL,
	"previous_snapshot" jsonb,
	"new_snapshot" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_provider_registry_events_id_check" CHECK ("ai_provider_registry_events"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "ai_provider_registry_events_entity_type_check" CHECK ("ai_provider_registry_events"."entity_type" in ('PROVIDER','MODEL_PROFILE','CREDENTIAL_REFERENCE')),
	CONSTRAINT "ai_provider_registry_events_change_type_check" CHECK ("ai_provider_registry_events"."change_type" in ('CREATED','UPDATED','ENABLED','DISABLED')),
	CONSTRAINT "ai_provider_registry_events_version_check" CHECK ("ai_provider_registry_events"."new_version" >= 1 and ("ai_provider_registry_events"."previous_version" is null or "ai_provider_registry_events"."new_version" = "ai_provider_registry_events"."previous_version" + 1)),
	CONSTRAINT "ai_provider_registry_events_creation_check" CHECK (("ai_provider_registry_events"."change_type" = 'CREATED' and "ai_provider_registry_events"."previous_version" is null and "ai_provider_registry_events"."previous_snapshot" is null) or ("ai_provider_registry_events"."change_type" <> 'CREATED' and "ai_provider_registry_events"."previous_version" is not null and "ai_provider_registry_events"."previous_snapshot" is not null)),
	CONSTRAINT "ai_provider_registry_events_actor_check" CHECK ("ai_provider_registry_events"."actor_reference" ~ '^staff:[A-Za-z0-9_-]{1,128}$')
);
--> statement-breakpoint
ALTER TABLE "ai_credential_references" ADD CONSTRAINT "ai_credential_references_provider_id_ai_provider_configs_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_provider_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_profile_capabilities" ADD CONSTRAINT "ai_model_profile_capabilities_profile_id_ai_model_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."ai_model_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_profiles" ADD CONSTRAINT "ai_model_profiles_provider_id_ai_provider_configs_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_provider_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credential_references_provider_alias_idx" ON "ai_credential_references" USING btree ("provider_id","alias");--> statement-breakpoint
CREATE INDEX "ai_credential_references_order_idx" ON "ai_credential_references" USING btree ("provider_id","priority","id");--> statement-breakpoint
CREATE INDEX "ai_model_profile_capabilities_lookup_idx" ON "ai_model_profile_capabilities" USING btree ("capability","profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_profiles_provider_name_idx" ON "ai_model_profiles" USING btree ("provider_id","name");--> statement-breakpoint
CREATE INDEX "ai_model_profiles_order_idx" ON "ai_model_profiles" USING btree ("provider_id","priority","id");--> statement-breakpoint
CREATE INDEX "ai_provider_configs_order_idx" ON "ai_provider_configs" USING btree ("priority","id");--> statement-breakpoint
CREATE INDEX "ai_provider_registry_events_order_idx" ON "ai_provider_registry_events" USING btree ("occurred_at","id");--> statement-breakpoint
CREATE INDEX "ai_provider_registry_events_entity_idx" ON "ai_provider_registry_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE FUNCTION "prevent_ai_provider_registry_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'ai_provider_registry_events is append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ai_provider_registry_events_append_only_trigger"
	BEFORE UPDATE OR DELETE ON "ai_provider_registry_events"
	FOR EACH ROW EXECUTE FUNCTION "prevent_ai_provider_registry_event_mutation"();
