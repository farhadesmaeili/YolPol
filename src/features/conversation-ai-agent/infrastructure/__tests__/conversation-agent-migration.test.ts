import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import {conversationAgentEscalationReasons} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";

const migration = readFileSync(resolve("drizzle/0019_conversation_ai_agent_escalations.sql"), "utf8");

describe("Conversation Agent escalation migration", () => {
  it("adds only content-free decision metadata and safely backfills prior successful responses", () => {
    expect(migration).toContain('ADD COLUMN "agent_decision" varchar(16)');
    expect(migration).toContain('ADD COLUMN "escalation_reason" varchar(64)');
    expect(migration).toContain("SET \"agent_decision\" = 'RESPOND' WHERE \"status\" = 'SUCCEEDED'");
    expect(migration).toContain("conversation_ai_response_jobs_decision_check");
    expect(migration).toContain("conversation_ai_response_jobs_escalation_check");
    expect(migration).toContain('"agent_decision" is not null');
    expect(migration).toContain('"agent_decision" is not distinct from');
    for (const reason of conversationAgentEscalationReasons) expect(migration).toContain(`'${reason}'`);
    expect(migration).not.toMatch(/body|prompt|transcript|tool_result|provider_response/iu);
  });
});
