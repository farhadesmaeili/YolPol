import {describe, expect, it, vi} from "vitest";

import {ResolveConversationForInquiry} from "@/features/inquiries/application/use-cases/resolve-conversation-for-inquiry";
import {UpdateConversationTyping} from "@/features/inquiries/application/use-cases/update-conversation-typing";

describe("Conversation typing application boundaries", () => {
  it("updates only the ephemeral registry and validates opaque identifiers", () => {
    const update = vi.fn();
    const useCase = new UpdateConversationTyping({update, subscribe: vi.fn()});
    expect(useCase.execute({conversationId: "conversation-1", participant: "CUSTOMER", actorKey: "customer", isTyping: true})).toEqual({status: "updated"});
    expect(update).toHaveBeenCalledWith({conversationId: "conversation-1", participant: "CUSTOMER", actorKey: "customer", isTyping: true});
    expect(useCase.execute({conversationId: "invalid/id", participant: "CUSTOMER", actorKey: "customer", isTyping: true})).toEqual({status: "validation_failed"});
    expect(useCase.execute({conversationId: "conversation-1", participant: "STAFF", actorKey: "unsafe actor", isTyping: true})).toEqual({status: "validation_failed"});
  });

  it("resolves the persisted inquiry-to-conversation relationship through a read-only port", async () => {
    const findConversationIdForInquiry = vi.fn().mockResolvedValue("conversation-1");
    const useCase = new ResolveConversationForInquiry({findConversationIdForInquiry});
    expect(await useCase.execute({inquiryId: "inquiry-1"})).toEqual({status: "resolved", conversationId: "conversation-1"});
    expect(findConversationIdForInquiry).toHaveBeenCalledWith("inquiry-1");
    findConversationIdForInquiry.mockResolvedValueOnce(null);
    expect(await useCase.execute({inquiryId: "inquiry-2"})).toEqual({status: "conversation_not_found"});
    expect(await useCase.execute({inquiryId: "invalid/id"})).toEqual({status: "validation_failed"});
  });
});
