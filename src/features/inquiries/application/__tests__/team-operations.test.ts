import {describe, expect, it, vi} from "vitest";

import type {
  AssignableTeamMemberDto,
  TeamInquiryDetailDto,
  TeamInquiryListItemDto,
} from "@/features/inquiries/application/dto/team-operations-dto";
import type {ConversationMessageReader} from "@/features/inquiries/application/ports/conversation-ports";
import type {InquiryWorkflowHistoryReader} from "@/features/inquiries/application/ports/inquiry-workflow-ports";
import type {
  TeamInquiryDetailSnapshot,
  TeamInquiryListQuery,
  TeamOperationsReadRepository,
} from "@/features/inquiries/application/ports/team-operations-read-port";
import {GetTeamInquiryDetail} from "@/features/inquiries/application/use-cases/get-team-inquiry-detail";
import {ListAssignableTeamMembers} from "@/features/inquiries/application/use-cases/list-assignable-team-members";
import {ListTeamInquiries} from "@/features/inquiries/application/use-cases/list-team-inquiries";
import {Message} from "@/features/inquiries/domain/entities/message";

const listItem = (id: string, createdAt: string, change: Partial<TeamInquiryListItemDto> = {}): TeamInquiryListItemDto => Object.freeze({
  id,
  status: "NEW",
  createdAt,
  updatedAt: createdAt,
  customerDisplayName: `Customer ${id}`,
  company: null,
  origin: Object.freeze({country: "TR", city: "Istanbul"}),
  destination: Object.freeze({country: "IR", city: "Tehran"}),
  assignment: null,
  items: Object.freeze([{productId: "product-1", sku: "PRODUCT-1", productName: "Bottle", quantity: 10, unit: "pallets" as const}]),
  conversationActivity: Object.freeze({messageCount: 0, latestMessage: null}),
  ...change,
});

const detailSnapshot = (assignment: TeamInquiryDetailDto["assignment"] = null): TeamInquiryDetailSnapshot => Object.freeze({
  inquiry: Object.freeze({
    id: "inquiry-detail",
    status: "WAITING_FOR_TEAM",
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-20T09:00:00.000Z",
    contact: Object.freeze({
      fullName: "Detail Customer",
      company: "Glass Buyer",
      email: "buyer@example.test",
      phone: "+905321234567",
      whatsappPhone: null,
      telegramUsername: null,
      preferredMethods: Object.freeze(["email" as const]),
    }),
    location: Object.freeze({country: "TR", city: "Istanbul"}),
    destination: Object.freeze({country: "IR", city: "Tehran"}),
    message: "Please send details.",
    items: Object.freeze([{productId: "product-1", sku: "PRODUCT-1", productName: "Bottle", quantity: 10, unit: "pallets" as const}]),
  }),
  assignment,
});

class FakeTeamOperationsReader implements TeamOperationsReadRepository {
  readonly queries: TeamInquiryListQuery[] = [];
  detail: TeamInquiryDetailSnapshot | null = null;
  members: readonly Readonly<{id: string; displayName: string; active: boolean}>[] = [];

  constructor(private readonly records: readonly TeamInquiryListItemDto[] = []) {}

  async listInquiries(query: TeamInquiryListQuery): Promise<readonly TeamInquiryListItemDto[]> {
    this.queries.push(query);
    const filtered = this.records
      .filter((record) => query.status === undefined || record.status === query.status)
      .filter((record) => {
        if (query.assignment?.type === "unassigned") return record.assignment === null;
        if (query.assignment?.type === "assigned") return record.assignment?.teamMemberId === query.assignment.teamMemberId;
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .filter((record) => {
        if (!query.cursor) return true;
        const cursorTime = query.cursor.createdAt.toISOString();
        return record.createdAt < cursorTime || (record.createdAt === cursorTime && record.id < query.cursor.inquiryId);
      });
    return Object.freeze(filtered.slice(0, query.limit));
  }

  async findInquiryDetail(): Promise<TeamInquiryDetailSnapshot | null> { return this.detail; }

  async listTeamMembers({activeOnly}: Readonly<{activeOnly: true}>): Promise<readonly AssignableTeamMemberDto[]> {
    return Object.freeze(this.members
      .filter((member) => !activeOnly || member.active)
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id))
      .map((member) => Object.freeze({id: member.id, displayName: member.displayName, active: true as const})));
  }
}

function workflowReader(events: Awaited<ReturnType<InquiryWorkflowHistoryReader["readHistory"]>> = []): InquiryWorkflowHistoryReader {
  return {readHistory: vi.fn().mockResolvedValue(events)};
}

function conversationReader(messages: Awaited<ReturnType<ConversationMessageReader["findForInquiry"]>> = []): ConversationMessageReader {
  return {findForInquiry: vi.fn().mockResolvedValue(messages)};
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) collectKeys(item, keys);
  else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) { keys.add(key); collectKeys(item, keys); }
  }
  return keys;
}

describe("ListTeamInquiries", () => {
  const sameTime = "2026-08-25T10:00:00.000Z";

  it("uses deterministic composite-cursor pagination without duplicates or omissions", async () => {
    const reader = new FakeTeamOperationsReader([
      listItem("inquiry-a", sameTime),
      listItem("inquiry-c", sameTime),
      listItem("inquiry-old", "2026-08-24T10:00:00.000Z"),
      listItem("inquiry-b", sameTime),
    ]);
    const useCase = new ListTeamInquiries(reader);

    const first = await useCase.execute({pageSize: 2});
    expect(first).toMatchObject({status: "found", inquiries: [{id: "inquiry-c"}, {id: "inquiry-b"}], nextCursor: expect.any(String)});
    if (first.status !== "found" || first.nextCursor === null) throw new Error("Expected another page.");
    const second = await useCase.execute({pageSize: 2, cursor: first.nextCursor});
    expect(second).toMatchObject({status: "found", inquiries: [{id: "inquiry-a"}, {id: "inquiry-old"}], nextCursor: null});
    if (second.status !== "found") throw new Error("Expected a page.");
    expect([...first.inquiries, ...second.inquiries].map(({id}) => id)).toEqual(["inquiry-c", "inquiry-b", "inquiry-a", "inquiry-old"]);
    expect(reader.queries[1]?.cursor).toEqual({createdAt: new Date(sameTime), inquiryId: "inquiry-b"});
  });

  it("applies status, assigned-member, and unassigned filters before pagination", async () => {
    const assignment = Object.freeze({teamMemberId: "member-1", displayName: "Member One", assignedAt: sameTime});
    const reader = new FakeTeamOperationsReader([
      listItem("new-assigned", sameTime, {assignment}),
      listItem("quoted-assigned", sameTime, {status: "QUOTED", assignment}),
      listItem("new-other", sameTime, {assignment: {...assignment, teamMemberId: "member-2"}}),
      listItem("new-unassigned", sameTime),
    ]);
    const useCase = new ListTeamInquiries(reader);

    await expect(useCase.execute({status: "NEW", assignment: {type: "assigned", teamMemberId: "member-1"}})).resolves.toMatchObject({status: "found", inquiries: [{id: "new-assigned"}]});
    await expect(useCase.execute({assignment: {type: "unassigned"}})).resolves.toMatchObject({status: "found", inquiries: [{id: "new-unassigned"}]});
  });

  it.each([0, -1, 101, 1.5, Number.NaN])("rejects invalid page size %s before persistence", async (pageSize) => {
    const reader = new FakeTeamOperationsReader();
    await expect(new ListTeamInquiries(reader).execute({pageSize})).resolves.toEqual({status: "validation_failed", field: "pageSize"});
    expect(reader.queries).toHaveLength(0);
  });

  it.each(["not-a-cursor", "%ZZ~inquiry-1", `${encodeURIComponent("invalid-date")}~inquiry-1`, `${encodeURIComponent(sameTime)}~invalid%2Fid`])("rejects malformed cursor %s", async (cursor) => {
    const reader = new FakeTeamOperationsReader();
    await expect(new ListTeamInquiries(reader).execute({cursor})).resolves.toEqual({status: "validation_failed", field: "cursor"});
    expect(reader.queries).toHaveLength(0);
  });

  it("rejects malformed filters before persistence", async () => {
    const reader = new FakeTeamOperationsReader();
    await expect(new ListTeamInquiries(reader).execute({status: "INVALID" as "NEW"})).resolves.toEqual({status: "validation_failed", field: "status"});
    await expect(new ListTeamInquiries(reader).execute({assignment: null as never})).resolves.toEqual({status: "validation_failed", field: "assignment"});
    await expect(new ListTeamInquiries(reader).execute({assignment: {type: "assigned", teamMemberId: "invalid/member"}})).resolves.toEqual({status: "validation_failed", field: "assignment"});
    expect(reader.queries).toHaveLength(0);
  });

  it("returns an immutable empty page", async () => {
    const result = await new ListTeamInquiries(new FakeTeamOperationsReader()).execute();
    expect(result).toEqual({status: "found", inquiries: [], nextCursor: null});
    if (result.status === "found") expect(Object.isFrozen(result.inquiries)).toBe(true);
  });
});

describe("GetTeamInquiryDetail", () => {
  it("combines assignment, ordered workflow history, and existing conversation messages", async () => {
    const assignment = Object.freeze({teamMemberId: "member-1", displayName: "Member One", assignedAt: "2026-08-20T09:00:00.000Z"});
    const reader = new FakeTeamOperationsReader();
    reader.detail = detailSnapshot(assignment);
    const events = Object.freeze([
      Object.freeze({id: "1", inquiryId: "inquiry-detail", type: "INQUIRY_CREATED" as const, previousValue: null, newValue: "NEW", actorReference: null, occurredAt: "2026-08-20T08:00:00.000Z"}),
      Object.freeze({id: "2", inquiryId: "inquiry-detail", type: "STATUS_CHANGED" as const, previousValue: "NEW", newValue: "WAITING_FOR_TEAM", actorReference: "STAFF:member-1", occurredAt: "2026-08-20T09:00:00.000Z"}),
    ]);
    const messages = Object.freeze([
      Message.create({id: "message-1", senderType: "CUSTOMER", channel: "WEBSITE", body: "Hello", createdAt: new Date("2026-08-20T08:05:00.000Z")}),
      Message.create({id: "message-2", senderType: "INTERNAL_USER", channel: "TELEGRAM", actorReference: "staff:member-1", body: "We are checking.", createdAt: new Date("2026-08-20T08:06:00.000Z")}),
    ]);

    const result = await new GetTeamInquiryDetail(reader, workflowReader(events), conversationReader(messages)).execute({inquiryId: "inquiry-detail"});
    expect(result).toMatchObject({status: "found", detail: {
      assignment,
      workflowHistory: [{id: "1"}, {id: "2"}],
      conversationMessages: [{id: "message-1", actorReference: null}, {id: "message-2", actorReference: "staff:member-1"}],
    }});
  });

  it("returns not found without reading child history", async () => {
    const history = workflowReader();
    const messages = conversationReader();
    await expect(new GetTeamInquiryDetail(new FakeTeamOperationsReader(), history, messages).execute({inquiryId: "missing-inquiry"})).resolves.toEqual({status: "inquiry_not_found"});
    expect(history.readHistory).not.toHaveBeenCalled();
    expect(messages.findForInquiry).not.toHaveBeenCalled();
  });

  it("supports a valid Inquiry with no Conversation", async () => {
    const reader = new FakeTeamOperationsReader();
    reader.detail = detailSnapshot();
    await expect(new GetTeamInquiryDetail(reader, workflowReader(), conversationReader(null)).execute({inquiryId: "inquiry-detail"})).resolves.toMatchObject({status: "found", detail: {conversationMessages: []}});
  });

  it("does not expose credentials, access digests, Outbox data, secrets, or internal prices", async () => {
    const reader = new FakeTeamOperationsReader();
    reader.detail = detailSnapshot();
    const result = await new GetTeamInquiryDetail(reader, workflowReader(), conversationReader()).execute({inquiryId: "inquiry-detail"});
    const keys = [...collectKeys(result)].map((key) => key.toLowerCase());
    expect(keys).not.toEqual(expect.arrayContaining([
      "conversationaccesstoken", "tokenlookup", "tokenhash", "accesslookupdigest", "internaltotalprice", "internalunitprice",
      "webhooksecret", "bottoken", "smtpcredentials", "databasecredentials", "outbox", "payload", "attempts", "lockeduntil",
    ]));
    expect(JSON.stringify(result)).not.toContain("987654321");
  });
});

describe("ListAssignableTeamMembers", () => {
  it("returns only active members in deterministic display-name and ID order", async () => {
    const reader = new FakeTeamOperationsReader();
    reader.members = [
      {id: "member-z", displayName: "Zara", active: true},
      {id: "member-inactive", displayName: "Aaron", active: false},
      {id: "member-b", displayName: "Alex", active: true},
      {id: "member-a", displayName: "Alex", active: true},
    ];
    await expect(new ListAssignableTeamMembers(reader).execute()).resolves.toEqual({status: "found", teamMembers: [
      {id: "member-a", displayName: "Alex", active: true},
      {id: "member-b", displayName: "Alex", active: true},
      {id: "member-z", displayName: "Zara", active: true},
    ]});
  });
});
