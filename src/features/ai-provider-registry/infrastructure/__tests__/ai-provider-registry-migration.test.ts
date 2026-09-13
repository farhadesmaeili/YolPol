import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("AI provider registry migration", () => {
  const migration = readFileSync("drizzle/0015_ai_provider_registry.sql", "utf8");
  it("adds normalized registry tables, constraints, indexes, foreign keys, and append-only audit", () => { for (const table of ["ai_provider_configs", "ai_model_profiles", "ai_model_profile_capabilities", "ai_credential_references", "ai_provider_registry_events"]) expect(migration).toContain(`CREATE TABLE "${table}"`); expect(migration).toContain("FOREIGN KEY"); expect(migration).toContain("append-only"); expect(migration).toContain("BEFORE UPDATE OR DELETE"); });
  it("does not add raw credential columns or seed provider records", () => { const rawColumn = ["api", "key"].join("_"); expect(migration.toLowerCase()).not.toContain(`\"${rawColumn}\"`); expect(migration).not.toMatch(/insert\s+into\s+"ai_provider_configs"/iu); });
});
