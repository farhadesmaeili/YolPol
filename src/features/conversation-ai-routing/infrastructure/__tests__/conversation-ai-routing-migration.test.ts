import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("Conversation AI routing migration", () => {
  const sql = readFileSync("drizzle/0017_conversation_ai_fallback_routing.sql", "utf8");

  it("adds normalized control, immutable event, and lease-safe job tables", () => {
    expect(sql).toContain('CREATE TABLE "conversation_ai_controls"');
    expect(sql).toContain('CREATE TABLE "conversation_ai_control_events"');
    expect(sql).toContain('CREATE TABLE "conversation_ai_response_jobs"');
    expect(sql).toContain('conversation_ai_response_jobs_trigger_uidx');
    expect(sql).toContain('conversation_ai_control_events_append_only_trigger');
    expect(sql).toContain("PENDING','RUNNING','SUCCEEDED','CANCELLED','SUPERSEDED','FAILED");
  });

  it("stores routing metadata only", () => {
    for (const forbidden of ["prompt", "transcript", "generated_response", "request_body", "response_body", "api_key"]) expect(sql.toLowerCase()).not.toContain(`\"${forbidden}\"`);
  });
});
