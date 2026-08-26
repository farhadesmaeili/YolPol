import {describe, expect, it, vi} from "vitest";

import type {ExternalChannelReply} from "@/features/inquiries/application/dto/notification-message";
import type {CommunicationRecipientRepository} from "@/features/inquiries/application/ports/communication-ports";
import type {ConversationMessageWriter} from "@/features/inquiries/application/ports/conversation-ports";
import {ReceiveTelegramReply} from "@/features/inquiries/application/use-cases/receive-telegram-reply";

const reply: ExternalChannelReply = {
  externalUpdateId: "987654",
  externalMessageId: "-100123:45",
  externalRecipientId: "-100123",
  senderExternalId: "456",
  body: "Please tell the customer production is available.",
  repliedMessageBody: "Inquiry #1234",
  inquiryId: "1234",
};

function recipientRepository(authorized = true): CommunicationRecipientRepository {
  return {
    async findAuthorizedNotificationRecipients() { return []; },
    async findAuthorizedTeamMember() {
      return authorized ? {id: "member-1", channel: "TELEGRAM", kind: "TEAM_MEMBER", externalId: "456", displayName: "Team member"} : null;
    },
  };
}

describe("ReceiveTelegramReply", () => {
  it("stores an authorized Telegram reply as an internal conversation message", async () => {
    const appendForInquiry = vi.fn<ConversationMessageWriter["appendForInquiry"]>().mockResolvedValue("created");
    const useCase = new ReceiveTelegramReply(recipientRepository(), {appendForInquiry}, {now: () => new Date("2026-08-25T01:02:03.000Z")});

    await expect(useCase.execute(reply)).resolves.toEqual({status: "created"});
    expect(appendForInquiry).toHaveBeenCalledWith("1234", expect.objectContaining({
      senderType: "INTERNAL_USER",
      channel: "TELEGRAM",
      body: reply.body,
    }));
    const storedMessage = appendForInquiry.mock.calls[0]?.[1];
    expect(storedMessage?.id.value).toBe("telegram_update_987654");
    expect(storedMessage?.actorReference).toBeNull();
    expect(storedMessage?.createdAt.toISOString()).toBe("2026-08-25T01:02:03.000Z");
  });

  it("rejects an unauthorized sender before conversation persistence", async () => {
    const appendForInquiry = vi.fn<ConversationMessageWriter["appendForInquiry"]>();
    const useCase = new ReceiveTelegramReply(recipientRepository(false), {appendForInquiry}, {now: () => new Date()});
    await expect(useCase.execute(reply)).resolves.toEqual({status: "unauthorized"});
    expect(appendForInquiry).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "conversation_not_found"] as const)("preserves the %s persistence outcome", async (status) => {
    const useCase = new ReceiveTelegramReply(recipientRepository(), {async appendForInquiry() { return status; }}, {now: () => new Date()});
    await expect(useCase.execute(reply)).resolves.toEqual({status});
  });

  it("rejects invalid provider identifiers and message values", async () => {
    const appendForInquiry = vi.fn<ConversationMessageWriter["appendForInquiry"]>();
    const useCase = new ReceiveTelegramReply(recipientRepository(), {appendForInquiry}, {now: () => new Date()});
    await expect(useCase.execute({...reply, externalUpdateId: "1:2"})).resolves.toEqual({status: "invalid_reply"});
    await expect(useCase.execute({...reply, inquiryId: "invalid/id"})).resolves.toEqual({status: "invalid_reply"});
    await expect(useCase.execute({...reply, body: "  "})).resolves.toEqual({status: "invalid_reply"});
    expect(appendForInquiry).not.toHaveBeenCalled();
  });

  it("maps dependency failures to a provider-neutral result", async () => {
    const recipients = recipientRepository();
    recipients.findAuthorizedTeamMember = async () => { throw new Error("database connection details"); };
    const useCase = new ReceiveTelegramReply(recipients, {async appendForInquiry() { return "created"; }}, {now: () => new Date()});
    await expect(useCase.execute(reply)).resolves.toEqual({status: "persistence_failed"});
  });
});
