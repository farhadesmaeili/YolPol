CREATE TABLE "inquiry_assignments" (
	"inquiry_id" varchar(128) PRIMARY KEY NOT NULL,
	"team_member_id" varchar(128) NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiry_team_members" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "inquiry_team_members_id_format_check" CHECK ("inquiry_team_members"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "inquiry_team_members_display_name_length_check" CHECK (char_length("inquiry_team_members"."display_name") between 1 and 120),
	CONSTRAINT "inquiry_team_members_timestamps_check" CHECK ("inquiry_team_members"."updated_at" >= "inquiry_team_members"."created_at")
);
--> statement-breakpoint
CREATE TABLE "inquiry_workflow_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"inquiry_id" varchar(128) NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"previous_value" varchar(128),
	"new_value" varchar(128),
	"actor_reference" varchar(160),
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "inquiry_workflow_events_type_check" CHECK ("inquiry_workflow_events"."event_type" in ('INQUIRY_CREATED','STATUS_CHANGED','ASSIGNED','UNASSIGNED')),
	CONSTRAINT "inquiry_workflow_events_values_check" CHECK (
    ("inquiry_workflow_events"."event_type" = 'INQUIRY_CREATED' and "inquiry_workflow_events"."previous_value" is null and "inquiry_workflow_events"."new_value" in ('NEW','WAITING_FOR_TEAM','WAITING_FOR_CUSTOMER','QUOTED','CONFIRMED','CLOSED')) or
    ("inquiry_workflow_events"."event_type" = 'STATUS_CHANGED' and "inquiry_workflow_events"."previous_value" in ('NEW','WAITING_FOR_TEAM','WAITING_FOR_CUSTOMER','QUOTED','CONFIRMED','CLOSED') and "inquiry_workflow_events"."new_value" in ('NEW','WAITING_FOR_TEAM','WAITING_FOR_CUSTOMER','QUOTED','CONFIRMED','CLOSED') and "inquiry_workflow_events"."previous_value" <> "inquiry_workflow_events"."new_value") or
    ("inquiry_workflow_events"."event_type" = 'ASSIGNED' and "inquiry_workflow_events"."new_value" is not null) or
    ("inquiry_workflow_events"."event_type" = 'UNASSIGNED' and "inquiry_workflow_events"."previous_value" is not null and "inquiry_workflow_events"."new_value" is null)
  ),
	CONSTRAINT "inquiry_workflow_events_actor_check" CHECK ("inquiry_workflow_events"."actor_reference" is null or char_length("inquiry_workflow_events"."actor_reference") between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "inquiries" DROP CONSTRAINT "inquiries_status_check";--> statement-breakpoint
UPDATE "inquiries"
SET "status" = CASE "status"
	WHEN 'received' THEN 'NEW'
	WHEN 'processing' THEN 'WAITING_FOR_TEAM'
	WHEN 'contacted' THEN 'WAITING_FOR_CUSTOMER'
	WHEN 'quoted' THEN 'QUOTED'
	WHEN 'won' THEN 'CONFIRMED'
	WHEN 'lost' THEN 'CLOSED'
	WHEN 'spam' THEN 'CLOSED'
	ELSE "status"
END
WHERE "status" IN ('received','processing','contacted','quoted','won','lost','spam');--> statement-breakpoint
ALTER TABLE "inquiry_assignments" ADD CONSTRAINT "inquiry_assignments_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_assignments" ADD CONSTRAINT "inquiry_assignments_team_member_id_inquiry_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."inquiry_team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_workflow_events" ADD CONSTRAINT "inquiry_workflow_events_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiry_assignments_team_member_idx" ON "inquiry_assignments" USING btree ("team_member_id","assigned_at");--> statement-breakpoint
CREATE INDEX "inquiry_team_members_active_idx" ON "inquiry_team_members" USING btree ("active","id");--> statement-breakpoint
CREATE INDEX "inquiry_workflow_events_inquiry_time_idx" ON "inquiry_workflow_events" USING btree ("inquiry_id","occurred_at","id");--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_status_check" CHECK ("inquiries"."status" in ('NEW','WAITING_FOR_TEAM','WAITING_FOR_CUSTOMER','QUOTED','CONFIRMED','CLOSED'));--> statement-breakpoint
INSERT INTO "inquiry_workflow_events" ("inquiry_id", "event_type", "previous_value", "new_value", "actor_reference", "occurred_at")
SELECT "id", 'INQUIRY_CREATED', NULL, 'NEW', NULL, "created_at"
FROM "inquiries";
