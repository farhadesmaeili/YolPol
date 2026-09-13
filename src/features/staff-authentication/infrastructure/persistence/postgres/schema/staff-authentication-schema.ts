import {sql} from "drizzle-orm";
import {boolean, check, index, pgTable, timestamp, uniqueIndex, varchar} from "drizzle-orm/pg-core";

import {inquiryTeamMembers} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";

export const staffAccounts = pgTable("staff_accounts", {
  id: varchar("id", {length: 128}).primaryKey(),
  teamMemberId: varchar("team_member_id", {length: 128}).notNull().references(() => inquiryTeamMembers.id, {onDelete: "restrict"}),
  normalizedEmail: varchar("normalized_email", {length: 254}).notNull(),
  passwordHash: varchar("password_hash", {length: 512}).notNull(),
  role: varchar("role", {length: 16}).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull(),
}, (table) => [
  uniqueIndex("staff_accounts_team_member_uidx").on(table.teamMemberId),
  uniqueIndex("staff_accounts_normalized_email_uidx").on(table.normalizedEmail),
  check("staff_accounts_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("staff_accounts_email_check", sql`char_length(${table.normalizedEmail}) between 3 and 254 and ${table.normalizedEmail} = lower(btrim(${table.normalizedEmail})) and ${table.normalizedEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'`),
  check("staff_accounts_password_hash_check", sql`char_length(${table.passwordHash}) between 1 and 512 and ${table.passwordHash} !~ '[[:cntrl:]]'`),
  check("staff_accounts_role_check", sql`${table.role} in ('SUPER_ADMIN','ADMIN','SALES','VIEWER')`),
  check("staff_accounts_timestamps_check", sql`${table.updatedAt} >= ${table.createdAt}`),
  index("staff_accounts_active_idx").on(table.active, table.id),
]);

export const staffSessions = pgTable("staff_sessions", {
  id: varchar("id", {length: 128}).primaryKey(),
  staffAccountId: varchar("staff_account_id", {length: 128}).notNull().references(() => staffAccounts.id, {onDelete: "restrict"}),
  tokenLookup: varchar("token_lookup", {length: 64}).notNull(),
  tokenVerification: varchar("token_verification", {length: 64}).notNull(),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  expiresAt: timestamp("expires_at", {withTimezone: true, mode: "date"}).notNull(),
  revokedAt: timestamp("revoked_at", {withTimezone: true, mode: "date"}),
}, (table) => [
  uniqueIndex("staff_sessions_token_lookup_uidx").on(table.tokenLookup),
  check("staff_sessions_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("staff_sessions_token_lookup_format_check", sql`${table.tokenLookup} ~ '^[a-f0-9]{64}$'`),
  check("staff_sessions_token_verification_format_check", sql`${table.tokenVerification} ~ '^[a-f0-9]{64}$'`),
  check("staff_sessions_expiration_check", sql`${table.expiresAt} > ${table.createdAt}`),
  check("staff_sessions_revocation_check", sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`),
  index("staff_sessions_account_idx").on(table.staffAccountId, table.createdAt),
  index("staff_sessions_active_expiry_idx").on(table.expiresAt).where(sql`${table.revokedAt} is null`),
]);

export const staffInvitations = pgTable("staff_invitations", {
  id: varchar("id", {length: 128}).primaryKey(),
  normalizedEmail: varchar("normalized_email", {length: 254}).notNull(),
  displayName: varchar("display_name", {length: 120}).notNull(),
  targetRole: varchar("target_role", {length: 16}).notNull(),
  tokenLookup: varchar("token_lookup", {length: 64}).notNull(),
  tokenVerification: varchar("token_verification", {length: 64}).notNull(),
  createdByStaffAccountId: varchar("created_by_staff_account_id", {length: 128}).notNull().references(() => staffAccounts.id, {onDelete: "restrict"}),
  createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull(),
  expiresAt: timestamp("expires_at", {withTimezone: true, mode: "date"}).notNull(),
  consumedAt: timestamp("consumed_at", {withTimezone: true, mode: "date"}),
  revokedAt: timestamp("revoked_at", {withTimezone: true, mode: "date"}),
}, (table) => [
  uniqueIndex("staff_invitations_token_lookup_uidx").on(table.tokenLookup),
  uniqueIndex("staff_invitations_outstanding_email_uidx").on(table.normalizedEmail).where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
  check("staff_invitations_id_format_check", sql`${table.id} ~ '^[A-Za-z0-9_-]{1,128}$'`),
  check("staff_invitations_email_check", sql`char_length(${table.normalizedEmail}) between 3 and 254 and ${table.normalizedEmail} = lower(btrim(${table.normalizedEmail})) and ${table.normalizedEmail} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'`),
  check("staff_invitations_display_name_check", sql`char_length(${table.displayName}) between 1 and 120 and ${table.displayName} = btrim(${table.displayName}) and ${table.displayName} !~ '[[:cntrl:]]'`),
  check("staff_invitations_target_role_check", sql`${table.targetRole} in ('ADMIN','SALES','VIEWER')`),
  check("staff_invitations_token_lookup_format_check", sql`${table.tokenLookup} ~ '^[a-f0-9]{64}$'`),
  check("staff_invitations_token_verification_format_check", sql`${table.tokenVerification} ~ '^[a-f0-9]{64}$'`),
  check("staff_invitations_expiration_check", sql`${table.expiresAt} > ${table.createdAt}`),
  check("staff_invitations_consumed_check", sql`${table.consumedAt} is null or ${table.consumedAt} >= ${table.createdAt}`),
  check("staff_invitations_revoked_check", sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`),
  check("staff_invitations_terminal_state_check", sql`${table.consumedAt} is null or ${table.revokedAt} is null`),
  index("staff_invitations_expiry_idx").on(table.expiresAt).where(sql`${table.consumedAt} is null and ${table.revokedAt} is null`),
  index("staff_invitations_creator_idx").on(table.createdByStaffAccountId, table.createdAt),
]);

export const staffAuthenticationPostgresSchema = {staffAccounts, staffSessions, staffInvitations, inquiryTeamMembers};
