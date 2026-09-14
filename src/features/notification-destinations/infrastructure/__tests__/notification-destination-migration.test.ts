import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

const migration = readFileSync(resolve("drizzle/0023_telegram_notification_destinations.sql"), "utf8");

describe("Telegram notification destination migration", () => {
  it("adds safe request, recipient invariants, and append-only audit persistence", () => {
    expect(migration).toContain('CREATE TABLE "telegram_group_connection_requests"');
    expect(migration).toContain('CREATE TABLE "communication_recipient_events"');
    expect(migration).toContain("notifications_enabled\" = false");
    expect(migration).toContain('"kind" = \'TEAM_MEMBER\' AND "team_member_id" is not null');
    expect(migration).toContain('SET "team_member_id" = null');
    expect(migration).toContain("communication_recipients_team_member_uidx");
    expect(migration).toContain("communication_recipients_enabled_authorized_check");
    expect(migration).toContain("communication_recipient_events_append_only_trigger");
    expect(migration).toContain("NOT VALID");
    expect(migration).not.toMatch(/delete from communication_recipients/iu);
  });
});
