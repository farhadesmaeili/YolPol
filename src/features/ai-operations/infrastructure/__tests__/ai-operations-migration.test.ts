import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const migration = readFileSync("drizzle/0014_ai_operations_control_plane.sql", "utf8");

describe("AI Operations migration", () => {
  it("is append-only DDL for the singleton policy, structured windows, and immutable event store", () => {
    expect(migration).toContain('CREATE TABLE "ai_operation_policy"');
    expect(migration).toContain('CREATE TABLE "ai_schedule_windows"');
    expect(migration).toContain('CREATE TABLE "ai_policy_events"');
    expect(migration).toContain("ai_operation_policy_singleton_check");
    expect(migration).toContain("ai_schedule_windows_minutes_check");
    expect(migration).toContain("ai_policy_events_creation_shape_check");
    expect(migration).toContain("ai_policy_events_append_only_trigger");
    expect(migration).not.toMatch(/(?:^|\n)\s*(?:UPDATE|INSERT INTO|DELETE FROM|TRUNCATE|DROP)\s/iu);
  });

  it("leaves the previously latest 0013 migration byte-for-byte unchanged", () => {
    expect(createHash("sha256").update(readFileSync("drizzle/0013_telegram_staff_onboarding.sql")).digest("hex"))
      .toBe("a008ba2e08264ffff901450fb02c7710fcdc650bf7b2504c5794e221081f37e4");
  });
});
