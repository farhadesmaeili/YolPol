import {describe, expect, it} from "vitest";

import {Conversation} from "@/features/inquiries/domain/entities/conversation";
import {ConversationStateError, ConversationValidationError} from "@/features/inquiries/domain/errors/conversation-errors";

const createdAt = new Date("2026-08-25T10:00:00.000Z");
const start = () => Conversation.start({id: "conversation-1", inquiryId: "inquiry-1", channel: "WEBSITE", createdAt});

describe("Conversation", () => {
  it("starts for an Inquiry without requiring a provider", () => {
    const conversation = start();
    expect(conversation.inquiryId.value).toBe("inquiry-1");
    expect(conversation.channel).toBe("WEBSITE");
    expect(conversation.messages).toEqual([]);
  });

  it.each(["CUSTOMER", "INTERNAL_USER", "AI_AGENT", "SYSTEM"] as const)("accepts %s messages", (senderType) => {
    const conversation = start();
    conversation.addMessage({id: `message-${senderType}`, senderType, channel: "WEBSITE", body: " Message body ", createdAt});
    expect(conversation.messages[0]).toMatchObject({senderType, channel: "WEBSITE", body: "Message body"});
    expect(conversation.messages[0]?.actorReference).toBeNull();
  });

  it("preserves an optional generic actor reference without coupling it to Staff authentication", () => {
    const conversation = start();
    conversation.addMessage({id: "message-staff", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member-1", body: "Reply", createdAt});
    expect(conversation.messages[0]?.actorReference?.value).toBe("staff:member-1");
  });

  it.each(["", " staff:member-1", "staff:member-1 ", "staff:\u0000member", "x".repeat(161)])("rejects invalid actor reference %#", (actorReference) => {
    const conversation = start();
    expect(() => conversation.addMessage({id: "message-invalid-actor", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference, body: "Reply", createdAt}))
      .toThrow(ConversationValidationError);
  });

  it("rejects duplicate and out-of-order messages", () => {
    const conversation = start();
    conversation.addMessage({id: "message-1", senderType: "CUSTOMER", channel: "WEBSITE", body: "First", createdAt});
    expect(() => conversation.addMessage({id: "message-1", senderType: "SYSTEM", channel: "WEBSITE", body: "Duplicate", createdAt})).toThrow(ConversationStateError);
    expect(() => conversation.addMessage({id: "message-2", senderType: "SYSTEM", channel: "WEBSITE", body: "Earlier", createdAt: new Date(createdAt.getTime() - 1)})).toThrow(ConversationStateError);
  });

  it("rejects blank messages and provider-specific channel values", () => {
    const conversation = start();
    expect(() => conversation.addMessage({id: "message-1", senderType: "CUSTOMER", channel: "WEBSITE", body: " ", createdAt})).toThrow(ConversationValidationError);
    expect(() => Conversation.start({id: "conversation-1", inquiryId: "inquiry-1", channel: "SMTP" as never, createdAt})).toThrow(ConversationValidationError);
  });
});
