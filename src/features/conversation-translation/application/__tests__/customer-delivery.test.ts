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
  it.each(["INTERNAL_USER", "AI_AGENT"] as const)("keeps %s fail-closed across target and status variants", async (senderType) => {
    const unsafeStates = [undefined, "PENDING", "RUNNING", "FAILED", "CANCELLED"] as const;
    const rows: TranslatableMessage[] = unsafeStates.map((status, position) => ({...row(position, senderType), translation: {
      sourceLocale: "fa", customerTargetLocale: "ar", translations: [
        {targetLocale: "tr", status: "SUCCEEDED", body: "Wrong target translation"},
        ...(status ? [{targetLocale: "ar" as const, status, body: "Unsafe non-success body"}] : []),
      ],
    }}));
    rows.push({...row(5, senderType), translation: {sourceLocale: "fa", customerTargetLocale: "ar", translations: [{targetLocale: "ar", status: "SUCCEEDED", body: ""}]}});
    rows.push({...row(6, senderType), translation: {sourceLocale: null, customerTargetLocale: "ar", translations: []}});
    rows.push({...row(7, senderType), translation: {sourceLocale: "ar", customerTargetLocale: "ar", deliveryState: "SKIPPED", translations: []}});
    rows.push({position: 8, message: Message.create({id: "system", senderType: "SYSTEM", channel: "WEBSITE", body: "Internal system", createdAt: new Date()}),
      translation: {sourceLocale: "ar", customerTargetLocale: "ar", translations: []}});
    rows.push({...row(9, senderType), translation: {sourceLocale: "fa", customerTargetLocale: "ar", translations: [{targetLocale: "ar", status: "SUCCEEDED", body: "Customer target translation"}]}});
    rows.push(row(10, "CUSTOMER"));
    rows.push({...row(11, "AI_AGENT"), translation: {sourceLocale: "ar", customerTargetLocale: "ar", translations: [{targetLocale: "fa", status: "SUCCEEDED", body: "Staff convenience secret"}]}});
    rows.push({...row(12, "AI_AGENT"), translation: {sourceLocale: "ar", customerTargetLocale: "ar", translations: []}});
    const reader = {findForInquiry: async () => projectCustomerMessages(rows).map(({message}) => message),
      findPositionedForInquiry: async () => projectCustomerMessages(rows),
      findAfterPositionForInquiry: async (_id: string, after: number, limit: number) => projectCustomerMessages(rows).filter(({position}) => position > after).slice(0, limit)};
    const history = await new GetConversationMessageHistory(reader).execute({inquiryId: "inquiry"});
    const stream = await new ReadNewConversationMessages(reader, toConversationMessageDto).execute({inquiryId: "inquiry", afterCursor: -1});
    expect(history).toMatchObject({messages: [{position: 9, body: "Customer target translation"}, {position: 10}, {position: 11}, {position: 12}]});
    expect(stream).toMatchObject({updates: [{cursor: 9, message: {body: "Customer target translation"}}, {cursor: 10}, {cursor: 11}, {cursor: 12}]});
    expect(JSON.stringify([history, stream])).not.toMatch(/Wrong target|Unsafe non-success|Staff convenience secret|Internal system/iu);
  });

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
  it.each(["PENDING", "RUNNING", "FAILED", "CANCELLED"] as const)("withholds a %s Staff row while allowing later Customer-safe content", async (status) => {
    let rows = [row(0, "CUSTOMER"), row(1, "INTERNAL_USER", status), {...row(2, "CUSTOMER"), resumePosition: 0}];
    const reader = {findForInquiry: async () => projectCustomerMessages(rows).map(({message}) => message),
      findAfterPositionForInquiry: async (_id: string, after: number, limit: number) => projectCustomerMessages(rows).filter(({position}) => position > after).slice(0, limit)};
    const history = new GetConversationMessageHistory(reader);
    const updates = new ReadNewConversationMessages(reader, toConversationMessageDto);
    expect(await history.execute({inquiryId: "inquiry"})).toMatchObject({messages: [{id: "message_0"}, {id: "message_2"}]});
    expect(await updates.execute({inquiryId: "inquiry", afterCursor: 0})).toMatchObject({updates: [{cursor: 2, resumeCursor: 0}]});
    rows = [rows[0]!, row(1, "INTERNAL_USER", "SUCCEEDED"), row(2, "CUSTOMER")];
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
  it("withholds an unknown outbound gap without suppressing later Customer-safe content", () => {
    const unknown: TranslatableMessage = {...row(0, "INTERNAL_USER"), translation: {sourceLocale: null, customerTargetLocale: "tr", translations: []}};
    const projected = projectCustomerMessages([unknown, row(1, "CUSTOMER"), row(2, "INTERNAL_USER", "SUCCEEDED")]);
    expect(projected.map(({position, message}) => ({position, body: message.body}))).toEqual([
      {position: 1, body: "Customer original"},
      {position: 2, body: "Turkish translation"},
    ]);
    expect(projected.map(({message}) => message.body)).not.toContain("Staff original");
  });
});
