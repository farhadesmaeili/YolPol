import {describe, expect, it, vi} from "vitest";

import type {ConversationChannelBindingRepository, ConversationChannelDeliveryRepository, ConversationChannelInboundRepository} from "@/features/conversation-channels/application/ports/conversation-channel-ports";
import {CreateConversationChannelBinding} from "@/features/conversation-channels/application/use-cases/create-conversation-channel-binding";
import {ProcessConversationChannelDeliveries} from "@/features/conversation-channels/application/use-cases/process-conversation-channel-deliveries";
import {RecordInboundChannelText} from "@/features/conversation-channels/application/use-cases/record-inbound-channel-text";
import {ScheduleConversationChannelDelivery} from "@/features/conversation-channels/application/use-cases/schedule-conversation-channel-delivery";
import type {ClaimedConversationChannelDelivery} from "@/features/conversation-channels/domain/types/conversation-channel-types";
import {conversationChannelTextMaxLength} from "@/features/conversation-channels/domain/value-objects/conversation-channel-values";
import {FakeConversationChannelOutboundAdapter} from "@/features/conversation-channels/testing/fakes/conversation-channel-fakes";

const now = new Date("2026-09-06T10:00:00.000Z");
const clock = {now: () => now};
const ids = {generate: () => "generated-1"};
const identity = {
  channel: "TELEGRAM" as const,
  providerKey: "telegram_primary",
  externalAccountReference: "account-1",
  externalConversationReference: "chat-42",
  externalParticipantReference: "participant-7",
};
const binding = {id: "binding-1", conversationId: "conversation-1", ...identity, createdAt: now, updatedAt: now};

function bindingRepository(): ConversationChannelBindingRepository {
  return {save: vi.fn().mockResolvedValue({status: "created", binding}), findByIdentity: vi.fn().mockResolvedValue(binding)};
}

function deliveryRepository(job?: ClaimedConversationChannelDelivery): ConversationChannelDeliveryRepository {
  return {
    schedule: vi.fn().mockResolvedValue({status: "scheduled", deliveryId: "delivery-1"}),
    claimDue: vi.fn().mockResolvedValue(job ? [job] : []),
    isLeaseCurrent: vi.fn().mockResolvedValue(true),
    markDelivered: vi.fn().mockResolvedValue(true),
    markRetryable: vi.fn().mockResolvedValue("rescheduled"),
    markFailed: vi.fn().mockResolvedValue(true),
    markUnknown: vi.fn().mockResolvedValue(true),
  };
}

const job: ClaimedConversationChannelDelivery = {
  id: "delivery-1", conversationId: "conversation-1", messageId: "message-1", ...identity,
  body: "Customer-safe text", attempts: 1, leaseToken: "lease-1", leasedUntil: new Date(now.getTime() + 60_000),
};

describe("Conversation Channel application", () => {
  it("creates a binding and preserves repository uniqueness outcomes", async () => {
    const repository = bindingRepository();
    const useCase = new CreateConversationChannelBinding(repository, ids, clock);
    await expect(useCase.execute({conversationId: "conversation-1", ...identity})).resolves.toEqual({status: "created", bindingId: "binding-1"});
    expect(repository.save).toHaveBeenCalledOnce();
    vi.mocked(repository.save).mockResolvedValueOnce({status: "conflict"});
    await expect(useCase.execute({conversationId: "conversation-2", ...identity})).resolves.toEqual({status: "conflict"});
  });

  it("rejects malformed binding identifiers before persistence", async () => {
    const repository = bindingRepository();
    const result = await new CreateConversationChannelBinding(repository, ids, clock).execute({conversationId: "conversation-1", ...identity, externalConversationReference: "bad id"});
    expect(result).toEqual({status: "validation_failed", field: "externalConversationReference"});
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("records exact inbound bindings, preserves duplicates, and never guesses unresolved customers", async () => {
    const bindings = bindingRepository();
    const inbound: ConversationChannelInboundRepository = {record: vi.fn().mockResolvedValue({status: "recorded", inboundMessageId: "inbound-1", bindingId: "binding-1", conversationId: "conversation-1", correlatedMessageId: null})};
    const useCase = new RecordInboundChannelText(bindings, inbound, ids, clock);
    const input = {...identity, externalMessageReference: "provider-message-1", body: "Hello", occurredAt: now};
    await expect(useCase.execute(input)).resolves.toMatchObject({status: "recorded", conversationId: "conversation-1"});
    vi.mocked(inbound.record).mockResolvedValueOnce({status: "duplicate", inboundMessageId: "inbound-1", bindingId: "binding-1", conversationId: "conversation-1", correlatedMessageId: null});
    await expect(useCase.execute(input)).resolves.toMatchObject({status: "duplicate", inboundMessageId: "inbound-1"});
    vi.mocked(bindings.findByIdentity).mockResolvedValueOnce(null);
    await expect(useCase.execute({...input, externalConversationReference: "unknown-chat"})).resolves.toEqual({status: "unresolved_binding"});
    expect(inbound.record).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized inbound bodies before dedupe persistence", async () => {
    const inbound: ConversationChannelInboundRepository = {record: vi.fn()};
    const result = await new RecordInboundChannelText(bindingRepository(), inbound, ids, clock).execute({
      ...identity, externalMessageReference: "provider-message-1", body: "x".repeat(conversationChannelTextMaxLength + 1), occurredAt: now,
    });
    expect(result).toEqual({status: "validation_failed", field: "body"});
    expect(inbound.record).not.toHaveBeenCalled();
  });

  it("schedules one logical delivery through the translation-aware repository boundary", async () => {
    const repository = deliveryRepository();
    await expect(new ScheduleConversationChannelDelivery(repository, ids, clock).execute({messageId: "message-1", bindingId: "binding-1"}))
      .resolves.toEqual({status: "scheduled", deliveryId: "delivery-1"});
    expect(repository.schedule).toHaveBeenCalledWith({id: "generated-1", messageId: "message-1", bindingId: "binding-1", now});
    vi.mocked(repository.schedule).mockResolvedValueOnce({status: "duplicate", deliveryId: "delivery-1"});
    await expect(new ScheduleConversationChannelDelivery(repository, ids, clock).execute({messageId: "message-1", bindingId: "binding-1"}))
      .resolves.toEqual({status: "duplicate", deliveryId: "delivery-1"});
  });

  it("sends customer-safe text with a stable idempotency reference and confirms delivery", async () => {
    const repository = deliveryRepository(job);
    const adapter = new FakeConversationChannelOutboundAdapter();
    await expect(new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).resolves.toMatchObject({claimed: 1, delivered: 1});
    expect(adapter.requests).toEqual([{...identity, text: "Customer-safe text", idempotencyReference: "delivery-1"}]);
    expect(repository.markDelivered).toHaveBeenCalledWith({job, providerMessageReference: "provider-message-1", now});
  });

  it.each([
    [{status: "RETRYABLE_FAILURE", failureCategory: "RATE_LIMITED"} as const, "markRetryable", "retried"],
    [{status: "PERMANENT_FAILURE", failureCategory: "DESTINATION_NOT_FOUND"} as const, "markFailed", "failed"],
    [{status: "UNKNOWN", failureCategory: "UNKNOWN_OUTCOME"} as const, "markUnknown", "unknown"],
  ])("persists the typed adapter outcome %#", async (adapterResult, method, count) => {
    const repository = deliveryRepository(job);
    const adapter = new FakeConversationChannelOutboundAdapter();
    adapter.result = adapterResult;
    const result = await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute();
    expect(result[count as keyof typeof result]).toBe(1);
    expect(repository[method as keyof ConversationChannelDeliveryRepository]).toHaveBeenCalledOnce();
  });

  it("terminalizes thrown adapter outcomes as unknown instead of risking a duplicate retry", async () => {
    const repository = deliveryRepository(job);
    const adapter = new FakeConversationChannelOutboundAdapter();
    adapter.failure = new Error("secret provider detail");
    await expect(new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).resolves.toMatchObject({unknown: 1, retried: 0});
    expect(repository.markUnknown).toHaveBeenCalledWith({job, now});
  });

  it("does not start a send after a prior batch item consumes the remaining lease", async () => {
    let time = now;
    const repository = deliveryRepository();
    vi.mocked(repository.claimDue).mockResolvedValue([job, {...job, id: "delivery-2"}]);
    const adapter = {sendText: vi.fn(async () => {
      time = job.leasedUntil;
      return {status: "DELIVERED" as const, providerMessageReference: "provider-1"};
    })};
    await new ProcessConversationChannelDeliveries(repository, adapter, {now: () => time}).execute();
    expect(adapter.sendText).toHaveBeenCalledTimes(1);
  });

  it("never retries an explicitly unknown outcome even if labeled retryable", async () => {
    const repository = deliveryRepository(job);
    const adapter = new FakeConversationChannelOutboundAdapter();
    adapter.result = {status: "RETRYABLE_FAILURE", failureCategory: "UNKNOWN_OUTCOME"};
    expect(await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).toMatchObject({unknown: 1, retried: 0});
    expect(repository.markRetryable).not.toHaveBeenCalled();
  });

  it("does not send when PostgreSQL ownership is lost despite an unexpired local timestamp", async () => {
    const repository = deliveryRepository(job);
    vi.mocked(repository.isLeaseCurrent).mockResolvedValue(false);
    const adapter = new FakeConversationChannelOutboundAdapter();
    expect(await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).toMatchObject({stale: 1});
    expect(adapter.requests).toEqual([]);
  });
});
