import {describe, expect, it, vi} from "vitest";

import type {ConversationMessageWriter} from "@/features/inquiries/application/ports/conversation-ports";
import {ReceiveCustomerMessage} from "@/features/inquiries/application/use-cases/receive-customer-message";

const input = {inquiryId: "inquiry-1", message: " Please send an update. "};

function create(result: "created" | "duplicate" | "conversation_not_found" = "created") {
  const appendForInquiry = vi.fn<ConversationMessageWriter["appendForInquiry"]>().mockResolvedValue(result);
  const useCase = new ReceiveCustomerMessage(
    {appendForInquiry},
    {generate: () => "website_message_1"},
    {now: () => new Date("2026-08-25T08:00:00.000Z")},
  );
  return {appendForInquiry, useCase};
}

describe("ReceiveCustomerMessage", () => {
  it("creates a customer Website message in the Inquiry conversation", async () => {
    const {appendForInquiry, useCase} = create();

    await expect(useCase.execute(input)).resolves.toEqual({status: "created", messageId: "website_message_1"});
    expect(appendForInquiry).toHaveBeenCalledWith("inquiry-1", expect.objectContaining({
      senderType: "CUSTOMER",
      channel: "WEBSITE",
      body: "Please send an update.",
    }));
    expect(appendForInquiry.mock.calls[0]?.[1].createdAt.toISOString()).toBe("2026-08-25T08:00:00.000Z");
  });

  it("returns not found when the Inquiry has no Conversation", async () => {
    const {useCase} = create("conversation_not_found");
    await expect(useCase.execute(input)).resolves.toEqual({status: "conversation_not_found"});
  });

  it.each([
    [{...input, inquiryId: "invalid/id"}, "inquiryId"],
    [{...input, message: "   "}, "message"],
    [{...input, message: "x".repeat(10_001)}, "message"],
  ] as const)("rejects invalid customer-owned input %#", async (invalid, field) => {
    const {appendForInquiry, useCase} = create();
    await expect(useCase.execute(invalid)).resolves.toEqual({status: "validation_failed", field});
    expect(appendForInquiry).not.toHaveBeenCalled();
  });

  it("maps ID, clock, duplicate, and persistence failures safely", async () => {
    const messages: ConversationMessageWriter = {appendForInquiry: vi.fn().mockRejectedValue(new Error("database secret"))};
    await expect(new ReceiveCustomerMessage(messages, {generate: () => "message-1"}, {now: () => new Date()}).execute(input)).resolves.toEqual({status: "persistence_failed"});
    await expect(new ReceiveCustomerMessage(messages, {generate: () => "invalid/id"}, {now: () => new Date()}).execute(input)).resolves.toEqual({status: "dependency_failed"});
    await expect(new ReceiveCustomerMessage(messages, {generate: () => "message-1"}, {now: () => new Date("invalid")}).execute(input)).resolves.toEqual({status: "dependency_failed"});
    await expect(create("duplicate").useCase.execute(input)).resolves.toEqual({status: "conflict"});
  });
});
