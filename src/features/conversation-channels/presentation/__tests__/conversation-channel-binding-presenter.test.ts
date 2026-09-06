import {describe, expect, it} from "vitest";

import {presentConversationChannelBinding} from "@/features/conversation-channels/presentation/presenters/conversation-channel-binding-presenter";

describe("Conversation Channel binding presenter", () => {
  it("maps dates without adding provider payloads or credentials", () => {
    const at = new Date("2026-09-06T10:00:00.000Z");
    expect(presentConversationChannelBinding({
      id: "binding-1", conversationId: "conversation-1", channel: "EMAIL", providerKey: "email_primary",
      externalAccountReference: "mailbox-1", externalConversationReference: "thread-1",
      externalParticipantReference: "customer@example.test", createdAt: at, updatedAt: at,
    })).toEqual({
      id: "binding-1", conversationId: "conversation-1", channel: "EMAIL", providerKey: "email_primary",
      externalAccountReference: "mailbox-1", externalConversationReference: "thread-1",
      externalParticipantReference: "customer@example.test", createdAt: at.toISOString(), updatedAt: at.toISOString(),
    });
  });
});
