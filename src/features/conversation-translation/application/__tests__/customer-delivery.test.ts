import {describe, expect, it} from "vitest";
import {projectCustomerMessages, type TranslatableMessage} from "@/features/conversation-translation/application/use-cases/project-customer-messages";
import {Message} from "@/features/inquiries/domain/entities/message";
import {ReadNewConversationMessages} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {GetConversationMessageHistory} from "@/features/inquiries/application/use-cases/get-conversation-message-history";
import {toConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";
import type {TranslationStatus} from "@/features/conversation-translation/domain/types/translation";

function row(position: number, senderType: "CUSTOMER" | "INTERNAL_USER" | "AI_AGENT", status: TranslationStatus = "PENDING"): TranslatableMessage {
  return {position, message: Message.create({id: `message_${position}`, senderType, channel: "WEBSITE", body: senderType === "CUSTOMER" ? "Customer original" : "Staff original", createdAt: new Date("2026-09-05T00:00:00Z")}),
    translation: {sourceLocale: senderType === "CUSTOMER" ? "tr" : "fa", customerTargetLocale: senderType === "CUSTOMER" ? null : "tr", translations: [{targetLocale: "tr", status, body: status === "SUCCEEDED" ? "Turkish translation" : null}]}};
}

describe("Customer translation delivery", () => {
  it.each(["FAILED", "CANCELLED"] as const)("skips %s at 11 and preserves durable gaps in history and SSE", async (status) => {
    const blocked = row(11, "INTERNAL_USER", status);
    const rows = [row(10, "CUSTOMER"), {...blocked, translation: {...blocked.translation!, deliveryState: "SKIPPED" as const}}, row(12, "CUSTOMER"), row(13, "INTERNAL_USER", "SUCCEEDED")];
    const reader = {findForInquiry: async () => projectCustomerMessages(rows).map(({message}) => message),
      findPositionedForInquiry: async () => projectCustomerMessages(rows),
      findAfterPositionForInquiry: async (_id: string, after: number, limit: number) => projectCustomerMessages(rows).filter(({position}) => position > after).slice(0, limit)};
    expect(await new GetConversationMessageHistory(reader).execute({inquiryId: "inquiry"})).toMatchObject({messages: [{position: 10}, {position: 12}, {position: 13}]});
    const stream = new ReadNewConversationMessages(reader, toConversationMessageDto);
    expect(await stream.execute({inquiryId: "inquiry", afterCursor: 10})).toMatchObject({updates: [{cursor: 12}, {cursor: 13, message: {body: "Turkish translation"}}]});
    expect(await stream.execute({inquiryId: "inquiry", afterCursor: 13})).toMatchObject({updates: []});
    expect(projectCustomerMessages(rows).map(({message}) => message.body)).not.toContain("Staff original");
  });
  it.each(["PENDING", "RUNNING", "FAILED", "CANCELLED"] as const)("holds history and SSE at %s; later Customer activity cannot advance the cursor", async (status) => {
    let rows = [row(0, "CUSTOMER"), row(1, "INTERNAL_USER", status), row(2, "CUSTOMER")];
    const reader = {findForInquiry: async () => projectCustomerMessages(rows).map(({message}) => message),
      findAfterPositionForInquiry: async (_id: string, after: number, limit: number) => projectCustomerMessages(rows).filter(({position}) => position > after).slice(0, limit)};
    const history = new GetConversationMessageHistory(reader);
    const updates = new ReadNewConversationMessages(reader, toConversationMessageDto);
    expect(await history.execute({inquiryId: "inquiry"})).toMatchObject({messages: [{body: "Customer original"}]});
    expect(await updates.execute({inquiryId: "inquiry", afterCursor: 0})).toMatchObject({updates: []});
    expect(await updates.execute({inquiryId: "inquiry", afterCursor: 1})).toMatchObject({updates: []});
    rows = [rows[0]!, row(1, "INTERNAL_USER", "SUCCEEDED"), rows[2]!];
    const result = await updates.execute({inquiryId: "inquiry", afterCursor: 0});
    expect(result).toMatchObject({updates: [{cursor: 1, message: {id: "message_1", body: "Turkish translation"}}, {cursor: 2}]});
    expect(await updates.execute({inquiryId: "inquiry", afterCursor: 2})).toMatchObject({updates: []});
    expect(JSON.stringify(await history.execute({inquiryId: "inquiry"}))).not.toContain("Staff original");
    expect(rows[1]!.message.body).toBe("Staff original");
  });
  it("delivers same-language Staff and AI originals and fails closed for unknown language", () => {
    for (const sender of ["INTERNAL_USER", "AI_AGENT"] as const) {
      const message = row(0, sender);
      expect(projectCustomerMessages([{...message, translation: {sourceLocale: "tr", customerTargetLocale: "tr", translations: []}}])[0]?.message).toBe(message.message);
      expect(projectCustomerMessages([{...message, translation: undefined}])).toEqual([]);
    }
  });
});
