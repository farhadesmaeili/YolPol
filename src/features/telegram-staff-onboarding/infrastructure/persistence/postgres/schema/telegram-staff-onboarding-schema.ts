import {sql} from "drizzle-orm";
import {bigint, check, index, pgTable, timestamp, uniqueIndex, varchar} from "drizzle-orm/pg-core";

import {inquiryTeamMembers} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";
import {staffAccounts} from "@/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema";

export const telegramStaffLinks = pgTable("telegram_staff_links", {
  id: varchar("id", {length: 128}).primaryKey(),
  teamMemberId: varchar("team_member_id", {length: 128}).notNull().references(() => inquiryTeamMembers.id, {onDelete: "restrict"}),
  telegramUserId: bigint("telegram_user_id", {mode: "bigint"}).notNull(),
  privateChatId: bigint("private_chat_id", {mode: "bigint"}).notNull(),
  firstLinkedAt: timestamp("first_linked_at", {withTimezone: true, mode: "date"}).notNull(),
  connectedAt: timestamp("connected_at", {withTimezone: true, mode: "date"}).notNull(),
  disconnectedAt: timestamp("disconnected_at", {withTimezone: true, mode: "date"}),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  uniqueIndex("telegram_staff_links_user_uidx").on(table.telegramUserId),
  uniqueIndex("telegram_staff_links_active_team_member_uidx").on(table.teamMemberId).where(sql`${table.disconnectedAt} is null`),
  uniqueIndex("telegram_staff_links_active_private_chat_uidx").on(table.privateChatId).where(sql`${table.disconnectedAt} is null`),
  check("telegram_staff_links_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("telegram_staff_links_user_positive_check", sql`${table.telegramUserId} > 0`),
  check("telegram_staff_links_private_chat_positive_check", sql`${table.privateChatId} > 0`),
  check("telegram_staff_links_lifecycle_check", sql`
    ${table.connectedAt} >= ${table.firstLinkedAt}
    and ${table.updatedAt} >= ${table.connectedAt}
    and (${table.disconnectedAt} is null or (${table.disconnectedAt} >= ${table.connectedAt} and ${table.updatedAt} >= ${table.disconnectedAt}))
  `),
  index("telegram_staff_links_team_member_history_idx").on(table.teamMemberId, table.firstLinkedAt),
]);

export const telegramConnectionRequests = pgTable("telegram_connection_requests", {
  id: varchar("id", {length: 128}).primaryKey(),
  staffAccountId: varchar("staff_account_id", {length: 128}).notNull().references(() => staffAccounts.id, {onDelete: "restrict"}),
  teamMemberId: varchar("team_member_id", {length: 128}).notNull().references(() => inquiryTeamMembers.id, {onDelete: "restrict"}),
  tokenLookup: varchar("token_lookup", {length: 64}).notNull(),
  tokenVerification: varchar("token_verification", {length: 64}).notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  expiresAt: timestamp("expires_at", {withTimezone: true, mode: "date"}).notNull(),
  consumedAt: timestamp("consumed_at", {withTimezone: true, mode: "date"}),
  revokedAt: timestamp("revoked_at", {withTimezone: true, mode: "date"}),
}, (table) => [
  uniqueIndex("telegram_connection_requests_token_lookup_uidx").on(table.tokenLookup),
  uniqueIndex("telegram_connection_requests_outstanding_staff_uidx").on(table.staffAccountId).where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
  check("telegram_connection_requests_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("telegram_connection_requests_lookup_format_check", sql`${table.tokenLookup} ~ '^[a-f0-9]{64}$'`),
  check("telegram_connection_requests_verification_format_check", sql`${table.tokenVerification} ~ '^[a-f0-9]{64}$'`),
  check("telegram_connection_requests_digest_separation_check", sql`${table.tokenLookup} <> ${table.tokenVerification}`),
  check("telegram_connection_requests_expiration_check", sql`${table.expiresAt} > ${table.createdAt}`),
  check("telegram_connection_requests_consumed_check", sql`${table.consumedAt} is null or ${table.consumedAt} >= ${table.createdAt}`),
  check("telegram_connection_requests_revoked_check", sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`),
  check("telegram_connection_requests_terminal_state_check", sql`${table.consumedAt} is null or ${table.revokedAt} is null`),
  index("telegram_connection_requests_owner_idx").on(table.staffAccountId, table.teamMemberId, table.createdAt),
  index("telegram_connection_requests_expiry_idx").on(table.expiresAt).where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
]);

export const telegramStaffOnboardingPostgresSchema = {
  telegramStaffLinks,
  telegramConnectionRequests,
  staffAccounts,
  inquiryTeamMembers,
};
