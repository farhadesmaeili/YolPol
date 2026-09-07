import {Pool} from "pg";
import {afterEach, describe, expect, it, vi} from "vitest";
import {PostgresCustomerMessageReader} from "@/features/conversation-translation/infrastructure/persistence/postgres-customer-message-reader";
import {GetConversationMessageHistory} from "@/features/inquiries/application/use-cases/get-conversation-message-history";
import {ReadNewConversationMessages} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {toConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";

afterEach(() => vi.restoreAllMocks());

describe("Postgres Customer reader projection boundary", () => {
  it("preserves the SQL frontier and projects equivalent safe history and updates without metadata", async () => {
    const pool = new Pool();
    const query = vi.spyOn(pool, "query");
    const rows = [{id: "ai", position: 25, sender_type: "AI_AGENT", channel: "WEBSITE", body: "Arabic AI", created_at: new Date("2026-09-05T10:00:00Z"),
      source_locale: "ar", customer_target_locale: "ar", status: null, translated_body: null, barrier_position: "20"},
    {id: "translated", position: 26, sender_type: "INTERNAL_USER", channel: "WEBSITE", body: "Private Staff source", created_at: new Date("2026-09-05T10:00:00Z"),
      source_locale: "fa", customer_target_locale: "ar", status: "SUCCEEDED", translated_body: "Customer translation", barrier_position: "20"}];
    for (let index = 0; index < 2; index += 1) {
      query.mockImplementationOnce(async () => ({rows: [{id: "conversation"}]})).mockImplementationOnce(async () => ({rows}));
    }
    const reader = new PostgresCustomerMessageReader(pool);
    const history = await new GetConversationMessageHistory(reader).execute({inquiryId: "inquiry"});
    const updates = await new ReadNewConversationMessages(reader, toConversationMessageDto).execute({inquiryId: "inquiry", afterCursor: 19});
    expect(history).toMatchObject({messages: [{id: "ai", position: 25, body: "Arabic AI"}, {id: "translated", position: 26, body: "Customer translation"}]});
    expect(updates).toMatchObject({updates: [{cursor: 25, resumeCursor: 19}, {cursor: 26, resumeCursor: 19}]});
    expect(JSON.stringify([history, updates])).not.toMatch(/Private Staff source|source_locale|translated_body|barrier_position|actorReference/u);
    const sql = String(query.mock.calls[1]![0]);
    expect(sql).toContain("l.source_locale is null or l.customer_target_locale is null");
    expect(sql).not.toContain("m.position<b.position");
    expect(query.mock.calls[1]![1]).toEqual(["conversation", -1, 1000]);
    expect(query.mock.calls[3]![1]).toEqual(["conversation", 19, 100]);
    await pool.end();
  });
});
