CREATE TABLE "inquiries" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"status" varchar(20) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"company" varchar(160),
	"email" varchar(254) NOT NULL,
	"phone" varchar(40) NOT NULL,
	"telegram_username" varchar(32),
	"preferred_contact_method" varchar(20) NOT NULL,
	"country" varchar(100) NOT NULL,
	"city" varchar(100),
	"destination_country" varchar(100),
	"destination_city" varchar(100),
	"message" text,
	"source_locale" varchar(2) NOT NULL,
	"source_path" text NOT NULL,
	"privacy_accepted" boolean NOT NULL,
	"privacy_accepted_at" timestamp with time zone NOT NULL,
	"privacy_policy_version" varchar(100) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "inquiries_id_format_check" CHECK ("inquiries"."id" ~ '^[A-Za-z0-9_-]{1,128}$'),
	CONSTRAINT "inquiries_status_check" CHECK ("inquiries"."status" in ('received','processing','contacted','quoted','won','lost','spam')),
	CONSTRAINT "inquiries_preferred_contact_check" CHECK ("inquiries"."preferred_contact_method" in ('email','whatsapp','telegram','phone')),
	CONSTRAINT "inquiries_source_locale_check" CHECK ("inquiries"."source_locale" in ('en','tr','fa','ar')),
	CONSTRAINT "inquiries_privacy_accepted_check" CHECK ("inquiries"."privacy_accepted" = true),
	CONSTRAINT "inquiries_destination_city_check" CHECK ("inquiries"."destination_city" is null or "inquiries"."destination_country" is not null),
	CONSTRAINT "inquiries_message_length_check" CHECK ("inquiries"."message" is null or char_length("inquiries"."message") between 1 and 2000),
	CONSTRAINT "inquiries_timestamps_check" CHECK ("inquiries"."updated_at" >= "inquiries"."created_at" and "inquiries"."privacy_accepted_at" <= "inquiries"."created_at")
);
--> statement-breakpoint
CREATE TABLE "inquiry_items" (
	"inquiry_id" varchar(128) NOT NULL,
	"position" integer NOT NULL,
	"product_id" varchar(64) NOT NULL,
	"sku" varchar(64) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"product_name" varchar(120) NOT NULL,
	"quantity" integer NOT NULL,
	"unit" varchar(20) NOT NULL,
	CONSTRAINT "inquiry_items_pkey" PRIMARY KEY("inquiry_id","position"),
	CONSTRAINT "inquiry_items_position_check" CHECK ("inquiry_items"."position" >= 0),
	CONSTRAINT "inquiry_items_product_id_format_check" CHECK ("inquiry_items"."product_id" ~ '^[A-Za-z0-9]([A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$'),
	CONSTRAINT "inquiry_items_sku_format_check" CHECK ("inquiry_items"."sku" ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
	CONSTRAINT "inquiry_items_slug_format_check" CHECK ("inquiry_items"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "inquiry_items_product_name_length_check" CHECK (char_length("inquiry_items"."product_name") between 2 and 120),
	CONSTRAINT "inquiry_items_quantity_check" CHECK ("inquiry_items"."quantity" between 1 and 1000000000),
	CONSTRAINT "inquiry_items_unit_check" CHECK ("inquiry_items"."unit" in ('pieces','packages','pallets','truckloads'))
);
--> statement-breakpoint
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiries_created_at_idx" ON "inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_items_inquiry_product_uidx" ON "inquiry_items" USING btree ("inquiry_id","product_id");