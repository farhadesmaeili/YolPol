ALTER TABLE "inquiries" ADD COLUMN "whatsapp_phone" varchar(40);--> statement-breakpoint
ALTER TABLE "inquiries" ALTER COLUMN "telegram_username" SET DATA TYPE varchar(33);--> statement-breakpoint
UPDATE "inquiries" SET "telegram_username" = '@' || "telegram_username" WHERE "telegram_username" IS NOT NULL AND "telegram_username" NOT LIKE '@%';--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "preferred_contact_methods" varchar(20)[];--> statement-breakpoint
UPDATE "inquiries"
SET
  "whatsapp_phone" = CASE
    WHEN "preferred_contact_method" = 'whatsapp'
      AND "phone" ~ '^\+[1-9][0-9]*([ -]?([0-9]+|\([0-9]+\)))*$'
      AND regexp_replace("phone", '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$'
    THEN regexp_replace("phone", '[ ()-]', '', 'g')
    ELSE NULL
  END,
  "preferred_contact_methods" = CASE "preferred_contact_method"
    WHEN 'email' THEN ARRAY['email']::varchar[]
    WHEN 'whatsapp' THEN ARRAY['whatsapp']::varchar[]
    WHEN 'telegram' THEN ARRAY['telegram']::varchar[]
    WHEN 'phone' THEN ARRAY['phone']::varchar[]
  END;--> statement-breakpoint
ALTER TABLE "inquiries" ALTER COLUMN "preferred_contact_methods" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" DROP CONSTRAINT "inquiries_preferred_contact_check";--> statement-breakpoint
ALTER TABLE "inquiries" DROP COLUMN "preferred_contact_method";--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_preferred_contacts_check" CHECK ("inquiries"."preferred_contact_methods" in (array['email']::varchar[], array['whatsapp']::varchar[], array['telegram']::varchar[], array['phone']::varchar[], array['email','whatsapp']::varchar[], array['email','telegram']::varchar[], array['whatsapp','telegram']::varchar[], array['email','whatsapp','telegram']::varchar[]));--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_whatsapp_contact_check" CHECK ("inquiries"."whatsapp_phone" is null or 'whatsapp' = any("inquiries"."preferred_contact_methods"));--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_telegram_contact_check" CHECK ("inquiries"."telegram_username" is null or 'telegram' = any("inquiries"."preferred_contact_methods"));
