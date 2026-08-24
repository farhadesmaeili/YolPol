import {sql} from "drizzle-orm";
import {boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar} from "drizzle-orm/pg-core";

export const inquiries = pgTable("inquiries", {
  id: varchar("id", {length: 128}).primaryKey(),
  status: varchar("status", {length: 20}).notNull(),
  fullName: varchar("full_name", {length: 120}).notNull(),
  company: varchar("company", {length: 160}),
  email: varchar("email", {length: 254}).notNull(),
  phone: varchar("phone", {length: 40}).notNull(),
  whatsappPhone: varchar("whatsapp_phone", {length: 40}),
  telegramUsername: varchar("telegram_username", {length: 33}),
  preferredContactMethods: varchar("preferred_contact_methods", {length: 20}).array().notNull(),
  country: varchar("country", {length: 100}).notNull(),
  city: varchar("city", {length: 100}),
  destinationCountry: varchar("destination_country", {length: 100}),
  destinationCity: varchar("destination_city", {length: 100}),
  message: text("message"),
  sourceLocale: varchar("source_locale", {length: 2}).notNull(),
  sourcePath: text("source_path").notNull(),
  privacyAccepted: boolean("privacy_accepted").notNull(),
  privacyAcceptedAt: timestamp("privacy_accepted_at", {withTimezone: true, mode: "date"}).notNull(),
  privacyPolicyVersion: varchar("privacy_policy_version", {length: 100}).notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  check("inquiries_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("inquiries_status_check", sql`${table.status} in ('received','processing','contacted','quoted','won','lost','spam')`),
  check("inquiries_preferred_contacts_check", sql`${table.preferredContactMethods} in (array['email']::varchar[], array['whatsapp']::varchar[], array['telegram']::varchar[], array['phone']::varchar[], array['email','whatsapp']::varchar[], array['email','telegram']::varchar[], array['whatsapp','telegram']::varchar[], array['email','whatsapp','telegram']::varchar[])`),
  check("inquiries_whatsapp_contact_check", sql`${table.whatsappPhone} is null or 'whatsapp' = any(${table.preferredContactMethods})`),
  check("inquiries_telegram_contact_check", sql`${table.telegramUsername} is null or 'telegram' = any(${table.preferredContactMethods})`),
  check("inquiries_source_locale_check", sql`${table.sourceLocale} in ('en','tr','fa','ar')`),
  check("inquiries_privacy_accepted_check", sql`${table.privacyAccepted} = true`),
  check("inquiries_destination_city_check", sql`${table.destinationCity} is null or ${table.destinationCountry} is not null`),
  check("inquiries_message_length_check", sql`${table.message} is null or char_length(${table.message}) between 1 and 2000`),
  check("inquiries_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt} and ${table.privacyAcceptedAt} <= ${table.createdAt}`),
  index("inquiries_created_at_idx").on(table.createdAt),
]);

export const inquiryItems = pgTable("inquiry_items", {
  inquiryId: varchar("inquiry_id", {length: 128}).notNull().references(() => inquiries.id, {onDelete: "cascade"}),
  position: integer("position").notNull(),
  productId: varchar("product_id", {length: 64}).notNull(),
  sku: varchar("sku", {length: 64}).notNull(),
  slug: varchar("slug", {length: 120}).notNull(),
  productName: varchar("product_name", {length: 120}).notNull(),
  quantity: integer("quantity").notNull(),
  unit: varchar("unit", {length: 20}).notNull(),
}, (table) => [
  primaryKey({name: "inquiry_items_pkey", columns: [table.inquiryId, table.position]}),
  uniqueIndex("inquiry_items_inquiry_product_uidx").on(table.inquiryId, table.productId),
  check("inquiry_items_position_check", sql`${table.position} >= 0`),
  check("inquiry_items_product_id_format_check", sql`${table.productId} ~ '^[A-Za-z0-9]([A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$'`),
  check("inquiry_items_sku_format_check", sql`${table.sku} ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'`),
  check("inquiry_items_slug_format_check", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check("inquiry_items_product_name_length_check", sql`char_length(${table.productName}) between 2 and 120`),
  check("inquiry_items_quantity_check", sql`${table.quantity} between 1 and 1000000000`),
  check("inquiry_items_unit_check", sql`${table.unit} in ('pieces','packages','pallets','truckloads')`),
]);

export const inquiryPostgresSchema = {inquiries, inquiryItems};
