import {describe, expect, it, vi} from "vitest";

import type {ExternalChannelReply} from "@/features/inquiries/application/dto/notification-message";
import type {CommunicationRecipientRepository, TelegramDeliveryRepository} from "@/features/inquiries/application/ports/communication-ports";
import type {CorrelatedConversationMessageWriter} from "@/features/inquiries/application/ports/conversation-ports";
import {ReceiveTelegramReply} from "@/features/inquiries/application/use-cases/receive-telegram-reply";

const reply: ExternalChannelReply = {
  externalUpdateId: "987654",
  externalMessageId: "-100123:45",
  externalRecipientId: "-100123",
  senderExternalId: "456",
  body: "Please tell the customer production is available.",
  repliedMessageId: "44",
};

function recipientRepository(teamMemberId: string | null = null, authorized = true, teamMemberActive: boolean | null = teamMemberId ? true : null): CommunicationRecipientRepository {
  return {
    async findAuthorizedNotificationRecipients() { return []; },
    async findAuthorizedTeamMember() {
      return authorized ? {id: "member-recipient", channel: "TELEGRAM", kind: "TEAM_MEMBER", externalId: "456", displayName: "Team member", teamMemberId, teamMemberActive} : null;
    },
  };
}

function deliveryRepository(conversationId: string | null = "conversation-1"): TelegramDeliveryRepository {
  return {
    snapshotRecipients: vi.fn(), claimDue: vi.fn(), markDelivered: vi.fn(), markRetryable: vi.fn(), markPermanentFailure: vi.fn(), markUnknown: vi.fn(), summarizeEvent: vi.fn(),
    findConversationByProviderMessage: vi.fn().mockResolvedValue(conversationId ? {conversationId} : null),
  };
}

describe("ReceiveTelegramReply", () => {
  it("uses provider binding and stores a mapped Staff actor", async () => {
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>().mockResolvedValue("created");
    const deliveries = deliveryRepository();
    const useCase = new ReceiveTelegramReply(recipientRepository("member-1"), deliveries, {appendForConversation}, {now: () => new Date("2026-08-25T01:02:03.000Z")});
    await expect(useCase.execute(reply)).resolves.toEqual({status: "created"});
    expect(deliveries.findConversationByProviderMessage).toHaveBeenCalledWith({telegramChatId: -100123, telegramMessageId: 44});
    expect(appendForConversation).toHaveBeenCalledWith("conversation-1", expect.objectContaining({senderType: "INTERNAL_USER", channel: "TELEGRAM", body: reply.body}));
    const stored = appendForConversation.mock.calls[0]?.[1];
    expect(stored?.id.value).toBe("telegram_update_987654");
    expect(stored?.actorReference?.value).toBe("staff:member-1");
  });

  it("accepts an authorized recipient without fabricating attribution", async () => {
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>().mockResolvedValue("created");
    await new ReceiveTelegramReply(recipientRepository(null), deliveryRepository(), {appendForConversation}, {now: () => new Date()}).execute(reply);
    expect(appendForConversation.mock.calls[0]?.[1].actorReference).toBeNull();
  });

  it("does not attribute new replies to an inactive mapped Team Member", async () => {
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>().mockResolvedValue("created");
    await new ReceiveTelegramReply(recipientRepository("member-1", true, false), deliveryRepository(), {appendForConversation}, {now: () => new Date()}).execute(reply);
    expect(appendForConversation.mock.calls[0]?.[1].actorReference).toBeNull();
  });

  it("uses the private chat binding independently from stable sender authorization", async () => {
    const deliveries = deliveryRepository();
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>().mockResolvedValue("created");
    await expect(new ReceiveTelegramReply(recipientRepository("member-1"), deliveries, {appendForConversation}, {now: () => new Date()}).execute({...reply, externalRecipientId: "456", externalMessageId: "456:45"})).resolves.toEqual({status: "created"});
    expect(deliveries.findConversationByProviderMessage).toHaveBeenCalledWith({telegramChatId: 456, telegramMessageId: 44});
  });

  it("rejects an unauthorized sender before correlation or persistence", async () => {
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>();
    const deliveries = deliveryRepository();
    await expect(new ReceiveTelegramReply(recipientRepository(null, false), deliveries, {appendForConversation}, {now: () => new Date()}).execute(reply)).resolves.toEqual({status: "unauthorized"});
    expect(deliveries.findConversationByProviderMessage).not.toHaveBeenCalled();
    expect(appendForConversation).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider binding without persistence", async () => {
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>();
    await expect(new ReceiveTelegramReply(recipientRepository(), deliveryRepository(null), {appendForConversation}, {now: () => new Date()}).execute(reply)).resolves.toEqual({status: "conversation_not_found"});
    expect(appendForConversation).not.toHaveBeenCalled();
  });

  it("rejects invalid provider identifiers without persistence", async () => {
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>();
    await expect(new ReceiveTelegramReply(recipientRepository(), deliveryRepository(), {appendForConversation}, {now: () => new Date()}).execute({...reply, externalRecipientId: "not-numeric"})).resolves.toEqual({status: "invalid_reply"});
    expect(appendForConversation).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "conversation_not_found"] as const)("preserves the %s persistence outcome", async (status) => {
    const useCase = new ReceiveTelegramReply(recipientRepository(), deliveryRepository(), {async appendForConversation() { return status; }}, {now: () => new Date()});
    await expect(useCase.execute(reply)).resolves.toEqual({status});
  });
});
