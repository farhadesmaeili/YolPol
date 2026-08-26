import {describe, expect, it, vi} from "vitest";

import type {ConversationMessageReader} from "@/features/inquiries/application/ports/conversation-ports";
import {GetConversationMessageHistory} from "@/features/inquiries/application/use-cases/get-conversation-message-history";
import {Message} from "@/features/inquiries/domain/entities/message";

const message = (id: string, senderType: "CUSTOMER" | "INTERNAL_USER", channel: "WEBSITE" | "TELEGRAM", body: string, createdAt: string) => Message.create({id, senderType, channel, body, createdAt: new Date(createdAt)});

function create(result: readonly Message[] | null) {
  const findForInquiry = vi.fn<ConversationMessageReader["findForInquiry"]>().mockResolvedValue(result);
  return {findForInquiry, useCase: new GetConversationMessageHistory({findForInquiry})};
}

describe("GetConversationMessageHistory", () => {
  it("returns the ordered presentation-safe message contract", async () => {
    const first = message("message-1", "CUSTOMER", "WEBSITE", "Please send an update.", "2026-08-25T08:00:00.000Z");
    const second = Message.create({id: "message-2", senderType: "INTERNAL_USER", channel: "TELEGRAM", actorReference: "staff:admin-main", body: "Your quote is being prepared.", createdAt: new Date("2026-08-25T08:05:00.000Z")});
    const {findForInquiry, useCase} = create([first, second]);

    await expect(useCase.execute({inquiryId: "inquiry-1"})).resolves.toEqual({status: "found", messages: [
      {id: "message-1", senderType: "CUSTOMER", channel: "WEBSITE", body: "Please send an update.", createdAt: "2026-08-25T08:00:00.000Z"},
      {id: "message-2", senderType: "INTERNAL_USER", channel: "TELEGRAM", body: "Your quote is being prepared.", createdAt: "2026-08-25T08:05:00.000Z"},
    ]});
    expect(JSON.stringify(await useCase.execute({inquiryId: "inquiry-1"}))).not.toMatch(/actorReference|staff:admin-main|admin-main/u);
    expect(findForInquiry).toHaveBeenCalledWith("inquiry-1");
  });

  it("distinguishes a missing Conversation from an empty Conversation", async () => {
    await expect(create(null).useCase.execute({inquiryId: "missing-inquiry"})).resolves.toEqual({status: "conversation_not_found"});
    await expect(create([]).useCase.execute({inquiryId: "empty-inquiry"})).resolves.toEqual({status: "found", messages: []});
  });

  it("rejects an invalid Inquiry ID before persistence", async () => {
    const {findForInquiry, useCase} = create([]);
    await expect(useCase.execute({inquiryId: "invalid/id"})).resolves.toEqual({status: "validation_failed", field: "inquiryId"});
    expect(findForInquiry).not.toHaveBeenCalled();
  });

  it("maps repository errors without exposing their details", async () => {
    const findForInquiry = vi.fn<ConversationMessageReader["findForInquiry"]>().mockRejectedValue(new Error("database secret"));
    const result = await new GetConversationMessageHistory({findForInquiry}).execute({inquiryId: "inquiry-1"});
    expect(result).toEqual({status: "persistence_failed"});
    expect(JSON.stringify(result)).not.toContain("database secret");
  });
});
