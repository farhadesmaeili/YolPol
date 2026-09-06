import {describe, expect, it, vi} from "vitest";

import type {ConversationAiRoutingRepository} from "@/features/conversation-ai-routing/application/ports/conversation-ai-routing-ports";
import {ProcessConversationAiFallbackJobs} from "@/features/conversation-ai-routing/application/use-cases/process-conversation-ai-fallback-jobs";
import {ScheduleCustomerAiFallback} from "@/features/conversation-ai-routing/application/use-cases/schedule-customer-ai-fallback";
import type {ClaimedConversationAiJob} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";
import {ConversationAgentExecutionError} from "@/features/conversation-ai-agent/domain/errors/conversation-agent-errors";
import {FakeConversationAiResponseGenerator} from "@/features/conversation-ai-routing/testing/fakes/conversation-ai-routing-fakes";

const now = new Date("2026-09-02T10:00:00.000Z");
const job: ClaimedConversationAiJob = {id: "ai_job_job_1", conversationId: "conversation-1", triggerMessageId: "message-1", triggerMessagePosition: 0, executionId: "ai_fallback_ai_job_job_1", leaseToken: "lease-1", leasedUntil: new Date(now.getTime() + 60_000), attempts: 1, createdAt: now};

function repository(finalResult: "succeeded" | "cancelled" | "superseded" = "succeeded") {
  return {
    claimDue: vi.fn().mockResolvedValue([job]),
    prepare: vi.fn().mockResolvedValue({status: "eligible", messages: [{id: "message-1", position: 0, senderType: "CUSTOMER", channel: "WEBSITE", body: "Hello", createdAt: now}]}),
    cancel: vi.fn().mockResolvedValue(undefined), fail: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue(finalResult), readStatus: vi.fn(), changeControl: vi.fn(),
  } satisfies ConversationAiRoutingRepository;
}

describe("Conversation AI routing use cases", () => {
  it("schedules exactly one stable plan only when AI Operations supplies a not-before instant", async () => {
    const planner = new ScheduleCustomerAiFallback({execute: vi.fn().mockResolvedValue({status: "scheduled", notBefore: new Date(now.getTime() + 60_000)})}, {generate: () => "ai_job_job_1"});
    await expect(planner.plan({triggerMessageId: "message-1", triggeredAt: now})).resolves.toMatchObject({id: "ai_job_job_1", triggerMessageId: "message-1", executionId: "ai_fallback_ai_job_job_1"});
    const disabled = new ScheduleCustomerAiFallback({execute: vi.fn().mockResolvedValue({status: "suppressed", reason: "DISABLED"})}, {generate: () => "ai_job_unused"});
    await expect(disabled.plan({triggerMessageId: "message-1", triggeredAt: now})).resolves.toBeNull();
  });

  it("checks Operations before generation and delegates the final atomic decision to persistence", async () => {
    const store = repository("cancelled");
    const generator = new FakeConversationAiResponseGenerator();
    const worker = new ProcessConversationAiFallbackJobs(store, {execute: vi.fn().mockResolvedValue({allowed: true, reason: "ALLOWED_FALLBACK"})}, generator, {now: () => now});
    await expect(worker.execute()).resolves.toEqual({claimed: 1, succeeded: 0, cancelled: 1, superseded: 0, failed: 0});
    expect(generator.requests).toEqual([{executionId: job.executionId, messages: expect.any(Array), deadline: new Date(now.getTime() + 45_000)}]);
    expect(store.finalize).toHaveBeenCalledWith({job, body: "Generated", decision: "RESPOND", now});
  });

  it("never calls the generator when global Operations is disabled", async () => {
    const store = repository();
    const generator = {generate: vi.fn()};
    const worker = new ProcessConversationAiFallbackJobs(store, {execute: vi.fn().mockResolvedValue({allowed: false, reason: "EMERGENCY_DISABLED"})}, generator as never, {now: () => now});
    await expect(worker.execute()).resolves.toMatchObject({cancelled: 1});
    expect(generator.generate).not.toHaveBeenCalled();
    expect(store.cancel).toHaveBeenCalledOnce();
  });

  it("marks one turn failed without appending an error when the Gateway exhausts its own policy", async () => {
    const store = repository();
    const generator = {generate: vi.fn().mockRejectedValue(new ConversationAgentExecutionError("NO_ELIGIBLE_CANDIDATES"))};
    const worker = new ProcessConversationAiFallbackJobs(store, {execute: vi.fn().mockResolvedValue({allowed: true, reason: "ALLOWED_FALLBACK"})}, generator, {now: () => now});
    await expect(worker.execute()).resolves.toEqual({claimed: 1, succeeded: 0, cancelled: 0, superseded: 0, failed: 1});
    expect(store.fail).toHaveBeenCalledWith({job, category: "NO_ELIGIBLE_CANDIDATES", now});
    expect(store.finalize).not.toHaveBeenCalled();
  });
});
