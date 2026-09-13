import {describe, expect, it, vi} from "vitest";

import type {ConversationMessageRepository, StaffReplyMessageIdFactory} from "@/features/inquiries/application/ports/conversation-ports";
import {SendStaffConversationReply} from "@/features/inquiries/application/use-cases/send-staff-conversation-reply";
import type {Message} from "@/features/inquiries/domain/entities/message";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";

const now = new Date("2026-08-26T12:00:00.000Z");
const input = Object.freeze({
  inquiryId: "inquiry-staff-reply",
  body: " Thank you. We are reviewing your request. ",
  clientMessageId: "019d-client-message-1",
  actorReference: "staff:member-1",
});

function createContext(options: Readonly<{
  inquiryExists?: boolean;
  appendResult?: "created" | "duplicate" | "conversation_not_found";
}> = {}) {
  const inquiry = new InquiryTestBuilder().with({id: input.inquiryId}).buildNew();
  const stored: Message[] = [];
  const findById = vi.fn().mockResolvedValue(options.inquiryExists === false ? null : inquiry);
  const appendForInquiry = vi.fn<ConversationMessageRepository["appendForInquiry"]>(async (_inquiryId, message) => {
    const result = options.appendResult ?? "created";
    if (result === "created") stored.push(message);
    return result;
  });
  const findForInquiry = vi.fn<ConversationMessageRepository["findForInquiry"]>(async () => Object.freeze([...stored]));
  const findAfterPositionForInquiry = vi.fn<ConversationMessageRepository["findAfterPositionForInquiry"]>().mockResolvedValue([]);
  const messages: ConversationMessageRepository = {appendForInquiry, findForInquiry, findAfterPositionForInquiry};
  const create = vi.fn<StaffReplyMessageIdFactory["create"]>().mockReturnValue("staff_web_deterministic_message_id");
  const useCase = new SendStaffConversationReply({findById}, messages, {create}, {now: () => new Date(now)});
  return {appendForInquiry, create, findById, findForInquiry, messages, stored, useCase};
}

describe("SendStaffConversationReply", () => {
  it("stores a normalized internal Website reply with its server-derived actor binding", async () => {
    const context = createContext();

    await expect(context.useCase.execute(input)).resolves.toEqual({
      status: "sent",
      idempotent: false,
      message: {
        id: "staff_web_deterministic_message_id",
        senderType: "INTERNAL_USER",
        channel: "WEBSITE",
        actorReference: "staff:member-1",
        body: "Thank you. We are reviewing your request.",
        createdAt: now.toISOString(),
      },
    });
    expect(context.create).toHaveBeenCalledWith("staff:member-1", "inquiry-staff-reply", "019d-client-message-1");
    expect(context.appendForInquiry).toHaveBeenCalledWith(input.inquiryId, expect.objectContaining({
      senderType: "INTERNAL_USER",
      channel: "WEBSITE",
      actorReference: expect.objectContaining({value: "staff:member-1"}),
      body: "Thank you. We are reviewing your request.",
    }));
  });

  it("distinguishes a missing Inquiry from an Inquiry without a Conversation", async () => {
    const missing = createContext({inquiryExists: false});
    await expect(missing.useCase.execute(input)).resolves.toEqual({status: "inquiry_not_found"});
    expect(missing.appendForInquiry).not.toHaveBeenCalled();

    const withoutConversation = createContext({appendResult: "conversation_not_found"});
    await expect(withoutConversation.useCase.execute(input)).resolves.toEqual({status: "conversation_not_found"});
  });

  it.each([
    [{...input, inquiryId: "invalid/id"}, "inquiryId"],
    [{...input, body: "   "}, "body"],
    [{...input, body: "x".repeat(10_001)}, "body"],
    [{...input, clientMessageId: "invalid/id"}, "clientMessageId"],
  ] as const)("rejects invalid input before repository access %#", async (invalidInput, field) => {
    const context = createContext();
    await expect(context.useCase.execute(invalidInput)).resolves.toEqual({status: "validation_failed", field});
    expect(context.findById).not.toHaveBeenCalled();
    expect(context.appendForInquiry).not.toHaveBeenCalled();
  });

  it("returns the original stored message for an idempotent retry", async () => {
    const context = createContext();
    const first = await context.useCase.execute(input);
    expect(first).toMatchObject({status: "sent", idempotent: false});
    context.appendForInquiry.mockResolvedValue("duplicate");

    const retry = await context.useCase.execute(input);
    expect(retry).toEqual({...first, idempotent: true});
    expect(context.stored).toHaveLength(1);
    expect(context.findForInquiry).toHaveBeenCalledWith(input.inquiryId);
  });

  it("allows a different legitimate client message identity to be inserted", async () => {
    const context = createContext();
    context.create.mockImplementation((_actorReference, _inquiryId, clientMessageId) => `staff_web_${clientMessageId}`);
    await expect(context.useCase.execute(input)).resolves.toMatchObject({status: "sent", idempotent: false});
    await expect(context.useCase.execute({...input, clientMessageId: "019d-client-message-2"}))
      .resolves.toMatchObject({status: "sent", idempotent: false});
    expect(context.stored.map(({id}) => id.value)).toEqual([
      "staff_web_019d-client-message-1",
      "staff_web_019d-client-message-2",
    ]);
  });

  it("rejects idempotency-key reuse with changed content or a key owned elsewhere", async () => {
    const changed = createContext();
    await changed.useCase.execute(input);
    changed.appendForInquiry.mockResolvedValue("duplicate");
    await expect(changed.useCase.execute({...input, body: "Changed content"})).resolves.toEqual({status: "conflict"});

    const elsewhere = createContext({appendResult: "duplicate"});
    await expect(elsewhere.useCase.execute(input)).resolves.toEqual({status: "conflict"});

    const actorConflict = createContext();
    await actorConflict.useCase.execute(input);
    actorConflict.appendForInquiry.mockResolvedValue("duplicate");
    await expect(actorConflict.useCase.execute({...input, actorReference: "staff:member-2"})).resolves.toEqual({status: "conflict"});
  });

  it("maps repository and message dependency failures without exposing their details", async () => {
    const inquiryFailure = createContext();
    inquiryFailure.findById.mockRejectedValue(new Error("database secret"));
    await expect(inquiryFailure.useCase.execute(input)).resolves.toEqual({status: "persistence_failed"});

    const appendFailure = createContext();
    appendFailure.appendForInquiry.mockRejectedValue(new Error("constraint name"));
    await expect(appendFailure.useCase.execute(input)).resolves.toEqual({status: "persistence_failed"});

    const idFailure = createContext();
    idFailure.create.mockImplementation(() => { throw new Error("crypto failure"); });
    await expect(idFailure.useCase.execute(input)).resolves.toEqual({status: "dependency_failed"});
  });

  it("has no workflow-status or assignment mutation dependency", async () => {
    const context = createContext();
    await context.useCase.execute(input);
    expect(context.findById).toHaveBeenCalledOnce();
    expect(context.appendForInquiry).toHaveBeenCalledOnce();
    expect(context.findForInquiry).not.toHaveBeenCalled();
  });
});
