import {describe, expect, it, vi} from "vitest";

import type {CommunicationRecipientRepository, TelegramMessageTransport} from "@/features/inquiries/application/ports/communication-ports";
import {TelegramCommunicationAdapter} from "@/features/inquiries/infrastructure/communication/telegram/telegram-communication-adapter";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";

describe("TelegramCommunicationAdapter", () => {
  it("sends a neutral notification only to recipients selected by the authorization repository", async () => {
    const recipients: CommunicationRecipientRepository = {async findAuthorizedNotificationRecipients() { return [
      {id: "sales-team", channel: "TELEGRAM", kind: "TEAM_GROUP", externalId: "-100123", displayName: "Sales"},
      {id: "member-1", channel: "TELEGRAM", kind: "TEAM_MEMBER", externalId: "456", displayName: "Member"},
    ]; }, async findAuthorizedTeamMember() { return null; }};
    const sendMessage = vi.fn<TelegramMessageTransport["sendMessage"]>().mockResolvedValue(undefined);
    const adapter = new TelegramCommunicationAdapter(recipients, {sendMessage});
    await adapter.sendInquiryCreated("event-1", new InquiryTestBuilder().with({id: "inq-1"}).buildNew());
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({recipientExternalId: "-100123", idempotencyKey: "event-1:sales-team"}));
  });

  it("delegates reply parsing to the verified Telegram update parser", () => {
    const adapter = new TelegramCommunicationAdapter({async findAuthorizedNotificationRecipients() { return []; }, async findAuthorizedTeamMember() { return null; }}, {async sendMessage() { return; }});
    expect(adapter.toExternalChannelReply({update_id: 1, message: {message_id: 2, from: {id: 3}, chat: {id: -4}, text: "Reply", reply_to_message: {text: "Inquiry #1234"}}})).toMatchObject({externalUpdateId: "1", senderExternalId: "3", inquiryId: "1234", body: "Reply"});
  });
});
