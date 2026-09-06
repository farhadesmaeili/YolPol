import {describe, expect, it} from "vitest";

import {ConversationChannelBinding} from "@/features/conversation-channels/domain/entities/conversation-channel-binding";
import {ConversationChannelDelivery} from "@/features/conversation-channels/domain/entities/conversation-channel-delivery";
import {NormalizedInboundChannelMessage} from "@/features/conversation-channels/domain/entities/normalized-inbound-channel-message";
import {ConversationChannelStateError, ConversationChannelValidationError} from "@/features/conversation-channels/domain/errors/conversation-channel-errors";
import {conversationChannelMaximumDeliveryAttempts, conversationChannelTextMaxLength} from "@/features/conversation-channels/domain/value-objects/conversation-channel-values";

const now = new Date("2026-09-06T10:00:00.000Z");
const identity = {
  channel: "TELEGRAM" as const,
  providerKey: "telegram_primary",
  externalAccountReference: "account-1",
  externalConversationReference: "chat-42",
  externalParticipantReference: "participant-7",
};

describe("Conversation Channel domain", () => {
  it("creates a bounded provider-neutral binding", () => {
    const binding = ConversationChannelBinding.create({id: "binding-1", conversationId: "conversation-1", ...identity, createdAt: now, updatedAt: now});
    expect(binding.toSnapshot()).toMatchObject({id: "binding-1", conversationId: "conversation-1", ...identity});
  });

  it("accepts the authoritative Conversation and Message ID grammar", () => {
    expect(ConversationChannelBinding.create({id: "binding-1", conversationId: "_conversation", ...identity, createdAt: now, updatedAt: now}).toSnapshot().conversationId).toBe("_conversation");
    expect(ConversationChannelDelivery.schedule({id: "delivery-1", conversationId: "_conversation", messageId: "-message", bindingId: "binding-1", createdAt: now}).toSnapshot().messageId).toBe("-message");
  });

  it.each([
    ["providerKey", "Telegram SDK"],
    ["externalConversationReference", `x${"a".repeat(160)}`],
    ["externalParticipantReference", "https://provider.example/customer"],
    ["externalAccountReference", "contains whitespace"],
  ])("rejects invalid or oversized %s identifiers", (field, value) => {
    expect(() => ConversationChannelBinding.create({id: "binding-1", conversationId: "conversation-1", ...identity, [field]: value, createdAt: now, updatedAt: now}))
      .toThrow(ConversationChannelValidationError);
  });

  it("accepts only bounded plain-text inbound content", () => {
    expect(NormalizedInboundChannelMessage.create({...identity, externalMessageReference: "message-1", body: "  Hello\r\nworld  ", occurredAt: now}).toSnapshot().body)
      .toBe("Hello\nworld");
    expect(() => NormalizedInboundChannelMessage.create({...identity, externalMessageReference: "message-2", body: "<script>alert(1)</script>", occurredAt: now}))
      .toThrow(ConversationChannelValidationError);
    expect(() => NormalizedInboundChannelMessage.create({...identity, externalMessageReference: "message-3", body: "x".repeat(conversationChannelTextMaxLength + 1), occurredAt: now}))
      .toThrow(ConversationChannelValidationError);
  });

  it("enforces delivery transitions and bounded retries", () => {
    const delivery = ConversationChannelDelivery.schedule({id: "delivery-1", conversationId: "conversation-1", messageId: "message-1", bindingId: "binding-1", createdAt: now});
    expect(() => delivery.deliver("provider-message-1", now)).toThrow(ConversationChannelStateError);
    for (let attempt = 1; attempt <= conversationChannelMaximumDeliveryAttempts; attempt += 1) {
      delivery.claim({leaseToken: `lease-${attempt}`, now: new Date(now.getTime() + attempt * 10), leasedUntil: new Date(now.getTime() + attempt * 10 + 60_000)});
      delivery.retry("PROVIDER_UNAVAILABLE", new Date(now.getTime() + attempt * 20));
    }
    expect(delivery.toSnapshot()).toMatchObject({status: "FAILED", attempts: 3, failureCategory: "PROVIDER_UNAVAILABLE"});
    expect(() => delivery.claim({leaseToken: "lease-4", now, leasedUntil: new Date(now.getTime() + 60_000)})).toThrow(ConversationChannelStateError);
  });

  it("requires a safe opaque provider reference for confirmed delivery", () => {
    const delivery = ConversationChannelDelivery.schedule({id: "delivery-1", conversationId: "conversation-1", messageId: "message-1", bindingId: "binding-1", createdAt: now});
    delivery.claim({leaseToken: "lease-1", now, leasedUntil: new Date(now.getTime() + 60_000)});
    expect(() => delivery.deliver("https://provider.example/messages/1", now)).toThrow(ConversationChannelValidationError);
  });

  it("terminalizes an uncertain send without making it retryable", () => {
    const delivery = ConversationChannelDelivery.schedule({id: "delivery-1", conversationId: "conversation-1", messageId: "message-1", bindingId: "binding-1", createdAt: now});
    delivery.claim({leaseToken: "lease-1", now, leasedUntil: new Date(now.getTime() + 60_000)});
    delivery.markUnknown(new Date(now.getTime() + 1));
    expect(delivery.toSnapshot()).toMatchObject({status: "UNKNOWN", failureCategory: "UNKNOWN_OUTCOME", terminalAt: new Date(now.getTime() + 1)});
  });

  it("rejects partial leases and exhausted pending states during reconstitution", () => {
    const state = ConversationChannelDelivery.schedule({id: "delivery-1", conversationId: "conversation-1", messageId: "message-1", bindingId: "binding-1", createdAt: now}).toSnapshot();
    expect(() => ConversationChannelDelivery.reconstitute({...state, leaseToken: "orphan-token"})).toThrow(ConversationChannelValidationError);
    expect(() => ConversationChannelDelivery.reconstitute({...state, attempts: 3})).toThrow(ConversationChannelValidationError);
  });
});
