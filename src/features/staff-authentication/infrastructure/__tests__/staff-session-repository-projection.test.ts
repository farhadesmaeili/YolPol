import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";

describe("PostgresStaffSessionRepository authorization projection", () => {
  it("does not fetch password or account-profile fields during session lookup", async () => {
    const source = await readFile("src/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-session-repository.ts", "utf8");
    expect(source).not.toMatch(/passwordHash|normalizedEmail|accountCreatedAt|accountUpdatedAt|StaffAccount\.reconstitute/u);
    expect(source).toContain('sa.active as "staffAccountActive"');
    expect(source).toContain("sa.role");
    expect(source).toContain('tm.active as "teamMemberActive"');
  });
});
