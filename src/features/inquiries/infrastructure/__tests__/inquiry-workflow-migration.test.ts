import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

describe("Inquiry team workflow migration", () => {
  it("is append-only and maps every legacy status before enforcing the new lifecycle", async () => {
    const migration = await readFile(resolve("drizzle/0006_hesitant_cyclops.sql"), "utf8");
    expect(migration).toContain('CREATE TABLE "inquiry_team_members"');
    expect(migration).toContain('CREATE TABLE "inquiry_assignments"');
    expect(migration).toContain('CREATE TABLE "inquiry_workflow_events"');
    for (const [legacy, current] of Object.entries({received:"NEW",processing:"WAITING_FOR_TEAM",contacted:"WAITING_FOR_CUSTOMER",quoted:"QUOTED",won:"CONFIRMED",lost:"CLOSED",spam:"CLOSED"})) {
      expect(migration).toContain(`WHEN '${legacy}' THEN '${current}'`);
    }
    expect(migration.indexOf('UPDATE "inquiries"')).toBeLessThan(migration.lastIndexOf('ADD CONSTRAINT "inquiries_status_check"'));
    expect(migration).toContain("SELECT \"id\", 'INQUIRY_CREATED', NULL, 'NEW', NULL, \"created_at\"");
  });
});
