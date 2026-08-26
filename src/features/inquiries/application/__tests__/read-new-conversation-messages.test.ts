import {describe, expect, it, vi} from "vitest";

import type {ConversationMessageUpdateReader} from "@/features/inquiries/application/ports/conversation-ports";
import {ReadNewConversationMessages, conversationMessageReadBatchLimit} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {Message} from "@/features/inquiries/domain/entities/message";

const message = Message.create({id: "message-2", senderType: "INTERNAL_USER", channel: "TELEGRAM", actorReference: "staff:admin-main", body: "Your quote is ready.", createdAt: new Date("2026-08-25T10:00:00.000Z")});

describe("ReadNewConversationMessages", () => {
  it("reads one bounded ordered page after the supplied cursor", async () => {
    const findAfterPositionForInquiry = vi.fn<ConversationMessageUpdateReader["findAfterPositionForInquiry"]>().mockResolvedValue([{position: 2, message}]);
    const result = await new ReadNewConversationMessages({findAfterPositionForInquiry}).execute({inquiryId: "inquiry-1", afterCursor: 1});

    expect(result).toEqual({status: "found", updates: [{cursor: 2, message: {id: "message-2", senderType: "INTERNAL_USER", channel: "TELEGRAM", body: "Your quote is ready.", createdAt: "2026-08-25T10:00:00.000Z"}}]});
    expect(JSON.stringify(result)).not.toMatch(/actorReference|staff:admin-main|admin-main/u);
    expect(findAfterPositionForInquiry).toHaveBeenCalledWith("inquiry-1", 1, conversationMessageReadBatchLimit);
  });

  it("rejects invalid cursors and oversized reads before persistence", async () => {
    const findAfterPositionForInquiry = vi.fn<ConversationMessageUpdateReader["findAfterPositionForInquiry"]>();
    const useCase = new ReadNewConversationMessages({findAfterPositionForInquiry});
    await expect(useCase.execute({inquiryId: "inquiry-1", afterCursor: -2})).resolves.toEqual({status: "validation_failed"});
    await expect(useCase.execute({inquiryId: "inquiry-1", afterCursor: -1, limit: conversationMessageReadBatchLimit + 1})).resolves.toEqual({status: "validation_failed"});
    expect(findAfterPositionForInquiry).not.toHaveBeenCalled();
  });

  it("maps missing conversations and persistence details safely", async () => {
    const missing = vi.fn<ConversationMessageUpdateReader["findAfterPositionForInquiry"]>().mockResolvedValue(null);
    await expect(new ReadNewConversationMessages({findAfterPositionForInquiry: missing}).execute({inquiryId: "inquiry-1", afterCursor: -1})).resolves.toEqual({status: "conversation_not_found"});
    const failing = vi.fn<ConversationMessageUpdateReader["findAfterPositionForInquiry"]>().mockRejectedValue(new Error("database secret"));
    const result = await new ReadNewConversationMessages({findAfterPositionForInquiry: failing}).execute({inquiryId: "inquiry-1", afterCursor: -1});
    expect(result).toEqual({status: "persistence_failed"});
    expect(JSON.stringify(result)).not.toContain("database secret");
  });
});
