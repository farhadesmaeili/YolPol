import type {Pool} from "pg";
import {describe, expect, it, vi} from "vitest";

import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {PostgresTeamOperationsReadRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-team-operations-read-repository";

const item = {productId: "product-1", sku: "PRODUCT-1", productName: "Glass Bottle", quantity: 20, unit: "pallets"};

function createPool(rows: readonly unknown[]) {
  const query = vi.fn().mockResolvedValue({rows});
  return {query, pool: {query} as unknown as Pool};
}

describe("PostgresTeamOperationsReadRepository", () => {
  it("uses one bounded, deterministic projection with parameterized cursor and filters", async () => {
    const row = {
      id: "inquiry-2",
      status: "WAITING_FOR_TEAM",
      createdAt: new Date("2026-08-25T10:00:00.000Z"),
      updatedAt: new Date("2026-08-25T11:00:00.000Z"),
      customerDisplayName: "Customer Two",
      company: "Buyer Co",
      country: "TR",
      city: "Istanbul",
      destinationCountry: "IR",
      destinationCity: "Tehran",
      teamMemberId: "member-1",
      teamMemberDisplayName: "Member One",
      assignedAt: new Date("2026-08-25T10:30:00.000Z"),
      items: [item],
      messageCount: 2,
      latestSenderType: "INTERNAL_USER",
      latestChannel: "TELEGRAM",
      latestMessageAt: new Date("2026-08-25T10:45:00.000Z"),
    };
    const {pool, query} = createPool([row]);
    const repository = new PostgresTeamOperationsReadRepository(pool);
    const cursorAt = new Date("2026-08-26T10:00:00.000Z");

    const result = await repository.listInquiries({
      limit: 26,
      cursor: {createdAt: cursorAt, inquiryId: "inquiry-3"},
      status: "WAITING_FOR_TEAM",
      assignment: {type: "assigned", teamMemberId: "member-1"},
    });

    expect(result).toEqual([{
      id: "inquiry-2",
      status: "WAITING_FOR_TEAM",
      createdAt: "2026-08-25T10:00:00.000Z",
      updatedAt: "2026-08-25T11:00:00.000Z",
      customerDisplayName: "Customer Two",
      company: "Buyer Co",
      origin: {country: "TR", city: "Istanbul"},
      destination: {country: "IR", city: "Tehran"},
      assignment: {teamMemberId: "member-1", displayName: "Member One", assignedAt: "2026-08-25T10:30:00.000Z"},
      items: [item],
      conversationActivity: {messageCount: 2, latestMessage: {senderType: "INTERNAL_USER", channel: "TELEGRAM", createdAt: "2026-08-25T10:45:00.000Z"}},
    }]);
    const [sql, values] = query.mock.calls[0]!;
    const normalized = String(sql).replace(/\s+/gu, " ").trim();
    expect(normalized).toContain("(i.created_at, i.id) < ($1::timestamptz, $2::varchar)");
    expect(normalized).toContain("i.status = $3");
    expect(normalized).toContain("a.team_member_id = $4");
    expect(normalized).toContain("order by i.created_at desc, i.id desc limit $5");
    expect(normalized).toContain("jsonb_agg");
    expect(normalized).toContain("order by cm.position desc limit 1");
    expect(normalized.toLowerCase()).not.toContain("select *");
    expect(values).toEqual([cursorAt, "inquiry-3", "WAITING_FOR_TEAM", "member-1", 26]);
  });

  it("filters unassigned inquiries in PostgreSQL and returns an empty bounded result", async () => {
    const {pool, query} = createPool([]);
    await expect(new PostgresTeamOperationsReadRepository(pool).listInquiries({limit: 2, cursor: null, assignment: {type: "unassigned"}})).resolves.toEqual([]);
    const [sql, values] = query.mock.calls[0]!;
    expect(String(sql).replace(/\s+/gu, " ")).toContain("where a.inquiry_id is null order by i.created_at desc, i.id desc limit $1");
    expect(values).toEqual([2]);
  });

  it("maps an explicit detail projection without credential, Outbox, or price columns", async () => {
    const {pool, query} = createPool([{
      id: "inquiry-detail",
      status: "NEW",
      createdAt: new Date("2026-08-25T10:00:00.000Z"),
      updatedAt: new Date("2026-08-25T10:00:00.000Z"),
      fullName: "Detail Customer",
      company: null,
      email: "detail@example.test",
      phone: "+905321234567",
      whatsappPhone: null,
      telegramUsername: "@detail_customer",
      preferredMethods: ["email", "telegram"],
      country: "TR",
      city: null,
      destinationCountry: null,
      destinationCity: null,
      message: null,
      teamMemberId: null,
      teamMemberDisplayName: null,
      assignedAt: null,
      items: [item],
    }]);

    const result = await new PostgresTeamOperationsReadRepository(pool).findInquiryDetail("inquiry-detail");
    expect(result).toMatchObject({inquiry: {id: "inquiry-detail", contact: {preferredMethods: ["email", "telegram"]}}, assignment: null});
    const sql = String(query.mock.calls[0]?.[0]).toLowerCase();
    expect(sql).not.toMatch(/conversation_access|token_lookup|token_hash|inquiry_outbox|internal.*price|select\s+\*/u);
    expect(query.mock.calls[0]?.[1]).toEqual(["inquiry-detail"]);
  });

  it("requests only active team members in deterministic order", async () => {
    const {pool, query} = createPool([
      {id: "member-a", displayName: "Alex", active: true},
      {id: "member-b", displayName: "Zara", active: true},
    ]);
    await expect(new PostgresTeamOperationsReadRepository(pool).listTeamMembers({activeOnly: true})).resolves.toEqual([
      {id: "member-a", displayName: "Alex", active: true},
      {id: "member-b", displayName: "Zara", active: true},
    ]);
    expect(String(query.mock.calls[0]?.[0]).replace(/\s+/gu, " ")).toContain("where active = true order by display_name asc, id asc");
  });

  it("converts malformed persistence data and query failures to the safe persistence error", async () => {
    const malformed = createPool([{id: "inquiry-1", status: "UNKNOWN"}]);
    await expect(new PostgresTeamOperationsReadRepository(malformed.pool).listInquiries({limit: 1, cursor: null})).rejects.toEqual(new InquiryPersistenceError());

    const query = vi.fn().mockRejectedValue(new Error("postgresql://user:secret@database/yolpol"));
    const repository = new PostgresTeamOperationsReadRepository({query} as unknown as Pool);
    await expect(repository.findInquiryDetail("inquiry-1")).rejects.toEqual(new InquiryPersistenceError());
  });
});
