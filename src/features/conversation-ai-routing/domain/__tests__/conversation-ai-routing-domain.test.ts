import {describe, expect, it} from "vitest";

import {ConversationAiControl} from "@/features/conversation-ai-routing/domain/entities/conversation-ai-control";
import {conversationAiExecutionId, conversationAiMessageId} from "@/features/conversation-ai-routing/domain/services/conversation-ai-identities";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

const principal = (role: "SUPER_ADMIN" | "ADMIN" | "SALES" | "VIEWER") => ({staffAccountId: "account-1", teamMemberId: "member-1", role, displayName: "Staff", actorReference: "staff:member-1"});

describe("Conversation AI routing domain", () => {
  it("keeps stable execution and message identities derived from one durable job", () => {
    const jobId = "ai_job_123e4567_e89b_12d3_a456_426614174000";
    expect(conversationAiExecutionId(jobId)).toBe(`ai_fallback_${jobId}`);
    expect(conversationAiMessageId(jobId)).toBe(`ai_response_${jobId}`);
    expect(() => conversationAiMessageId("browser supplied/id")).toThrow();
  });

  it("restores the three explicit control states and rejects invalid persisted state", () => {
    for (const state of ["AUTO", "PAUSED", "HUMAN_TAKEOVER"] as const) {
      expect(ConversationAiControl.restore({conversationId: "conversation-1", state, version: 1, updatedAt: new Date(), updatedBy: "staff:member-1"}).state).toBe(state);
    }
    expect(() => ConversationAiControl.restore({conversationId: "conversation-1", state: "DISABLED", version: 1, updatedAt: new Date(), updatedBy: "staff:member-1"})).toThrow();
  });

  it("authorizes explicit control for operational roles and keeps VIEWER read-only", () => {
    const authorization = new StaffAuthorizationPolicy();
    expect(authorization.mayControlConversationAi(principal("SUPER_ADMIN"))).toBe(true);
    expect(authorization.mayControlConversationAi(principal("ADMIN"))).toBe(true);
    expect(authorization.mayControlConversationAi(principal("SALES"))).toBe(true);
    expect(authorization.mayControlConversationAi(principal("VIEWER"))).toBe(false);
  });
});
