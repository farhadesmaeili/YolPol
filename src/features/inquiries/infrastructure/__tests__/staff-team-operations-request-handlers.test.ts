import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {
  createStaffInquiryDetailRequestHandler,
  createStaffInquiryListRequestHandler,
  createStaffTeamMembersRequestHandler,
} from "@/features/inquiries/infrastructure/http/staff-team-operations-request-handlers";

const credential = `yps_${"A".repeat(43)}`;
const cookie = `yolpol_staff_session=${credential}`;
const principal: StaffPrincipal = Object.freeze({
  staffAccountId: "account-1",
  teamMemberId: "member-1",
  role: "SALES",
  displayName: "Sales Member",
  actorReference: "staff:member-1",
});

const listItem = Object.freeze({
  id: "inquiry-1",
  status: "WAITING_FOR_TEAM" as const,
  createdAt: "2026-08-26T08:00:00.000Z",
  updatedAt: "2026-08-26T08:05:00.000Z",
  customerDisplayName: "Customer One",
  company: "Buyer Co",
  origin: Object.freeze({country: "TR", city: "Istanbul"}),
  destination: Object.freeze({country: "IR", city: "Tehran"}),
  assignment: null,
  items: Object.freeze([{
    productId: "product-1",
    sku: "PRODUCT-1",
    productName: "Glass Bottle",
    quantity: 10,
    unit: "pallets" as const,
  }]),
  conversationActivity: Object.freeze({messageCount: 1, latestMessage: Object.freeze({
    senderType: "CUSTOMER" as const,
    channel: "WEBSITE" as const,
    createdAt: "2026-08-26T08:01:00.000Z",
  })}),
});

const detail = Object.freeze({
  inquiry: Object.freeze({
    id: "inquiry-1",
    status: "WAITING_FOR_TEAM" as const,
    createdAt: "2026-08-26T08:00:00.000Z",
    updatedAt: "2026-08-26T08:05:00.000Z",
    contact: Object.freeze({
      fullName: "Customer One",
      company: "Buyer Co",
      email: "buyer@example.test",
      phone: "+905321234567",
      whatsappPhone: null,
      telegramUsername: null,
      preferredMethods: Object.freeze(["email" as const]),
    }),
    location: Object.freeze({country: "TR", city: "Istanbul"}),
    destination: Object.freeze({country: "IR", city: "Tehran"}),
    message: "Please send details.",
    items: listItem.items,
  }),
  assignment: null,
  workflowHistory: Object.freeze([Object.freeze({
    id: "event-1",
    inquiryId: "inquiry-1",
    type: "INQUIRY_CREATED" as const,
    previousValue: null,
    newValue: "NEW",
    actorReference: null,
    occurredAt: "2026-08-26T08:00:00.000Z",
  })]),
  conversationMessages: Object.freeze([Object.freeze({
    id: "message-1",
    senderType: "CUSTOMER" as const,
    channel: "WEBSITE" as const,
    actorReference: null,
    body: "Please send details.",
    createdAt: "2026-08-26T08:00:00.000Z",
  }), Object.freeze({
    id: "message-2",
    senderType: "INTERNAL_USER" as const,
    channel: "WEBSITE" as const,
    actorReference: "staff:member-1",
    body: "We are reviewing your request.",
    createdAt: "2026-08-26T08:05:00.000Z",
  })]),
});

function authenticatedAccess(staffPrincipal: StaffPrincipal = principal) {
  return {
    resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated", principal: staffPrincipal} as const)},
    authorization: new StaffAuthorizationPolicy(),
  };
}

function operations() {
  return {
    listInquiries: {execute: vi.fn().mockResolvedValue({status: "found", inquiries: [listItem], nextCursor: "next-cursor"} as const)},
    getInquiryDetail: {execute: vi.fn().mockResolvedValue({status: "found", detail} as const)},
    listAssignableTeamMembers: {execute: vi.fn().mockResolvedValue({status: "found", teamMembers: [{id: "member-1", displayName: "Sales Member", active: true}]} as const)},
  };
}

function request(path: string, headers: HeadersInit = {}): Request {
  return new Request(`https://yolpol.com${path}`, {headers: {Cookie: cookie, ...headers}});
}

function detailContext(inquiryId = "inquiry-1") {
  return {params: Promise.resolve({inquiryId})};
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      keys.add(key.toLowerCase());
      collectKeys(entry, keys);
    }
  }
  return keys;
}

function expectKeysNotToContain(keys: ReadonlySet<string>, forbiddenKeys: readonly string[]): void {
  for (const forbiddenKey of forbiddenKeys) {
    expect(keys.has(forbiddenKey.toLowerCase())).toBe(false);
  }
}

const forbiddenCredentialAndPricingKeys = Object.freeze([
  "passwordHash",
  "sessionCredential",
  "tokenLookup",
  "tokenVerification",
  "tokenHash",
  "conversationAccessToken",
  "accessLookupDigest",
  "internalUnitPrice",
  "internalUnitPriceIrr",
  "internalTotalPrice",
]);

describe("response confidentiality key collection", () => {
  it("discovers nested sensitive keys using their normalized membership form", () => {
    const keys = collectKeys({safe: {nested: [{passwordHash: "should-never-be-serialized"}]}});
    expect(keys.has("passwordhash")).toBe(true);
  });
});

describe("Staff Team Operations authentication and authorization", () => {
  it("requires the Staff session cookie for every endpoint", async () => {
    const access = authenticatedAccess();
    const reads = operations();
    const list = createStaffInquiryListRequestHandler(() => access, () => reads);
    const inquiry = createStaffInquiryDetailRequestHandler(() => access, () => reads);
    const members = createStaffTeamMembersRequestHandler(() => access, () => reads);

    const responses = await Promise.all([
      list(new Request("https://yolpol.com/api/staff/inquiries")),
      inquiry(new Request("https://yolpol.com/api/staff/inquiries/inquiry-1"), detailContext()),
      members(new Request("https://yolpol.com/api/staff/team-members")),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await body(response)).toEqual({status: "error", code: "unauthorized"});
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(access.resolveSession.execute).not.toHaveBeenCalled();
  });

  it("rejects a malformed duplicate Staff cookie without resolving either value", async () => {
    const access = authenticatedAccess();
    const reads = operations();
    const handler = createStaffInquiryListRequestHandler(() => access, () => reads);
    const response = await handler(request("/api/staff/inquiries", {Cookie: `${cookie}; ${cookie}`}));
    expect(response.status).toBe(401);
    expect(access.resolveSession.execute).not.toHaveBeenCalled();
    expect(reads.listInquiries.execute).not.toHaveBeenCalled();
  });

  it.each(["malformed", "unknown", "revoked", "expired", "inactive Staff Account", "inactive Team Member"])(
    "returns the same 401 for a session resolved as unauthorized (%s)",
    async () => {
      const access = {
        resolveSession: {execute: vi.fn().mockResolvedValue({status: "unauthorized"} as const)},
        authorization: new StaffAuthorizationPolicy(),
      };
      const reads = operations();
      const response = await createStaffInquiryListRequestHandler(() => access, () => reads)(request("/api/staff/inquiries"));
      expect(response.status).toBe(401);
      expect(await body(response)).toEqual({status: "error", code: "unauthorized"});
      expect(reads.listInquiries.execute).not.toHaveBeenCalled();
    },
  );

  it.each(["ADMIN", "SALES"] as const)("allows the existing %s Team Operations capability", async (role) => {
    const access = authenticatedAccess({...principal, role});
    const reads = operations();
    const response = await createStaffInquiryListRequestHandler(() => access, () => reads)(request("/api/staff/inquiries"));
    expect(response.status).toBe(200);
    expect(reads.listInquiries.execute).toHaveBeenCalledWith({});
  });

  it("returns 403 for an authenticated principal without the Team Operations capability", async () => {
    const access = {
      resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated", principal} as const)},
      authorization: {mayPerformTeamOperations: vi.fn().mockReturnValue(false)},
    };
    const reads = operations();
    const response = await createStaffInquiryListRequestHandler(() => access, () => reads)(request("/api/staff/inquiries"));
    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({status: "error", code: "forbidden"});
    expect(reads.listInquiries.execute).not.toHaveBeenCalled();
  });

  it.each(["persistence_failed", "dependency_failed"] as const)("maps session %s to a safe 503", async (status) => {
    const access = {
      resolveSession: {execute: vi.fn().mockResolvedValue({status} as const)},
      authorization: new StaffAuthorizationPolicy(),
    };
    const response = await createStaffInquiryListRequestHandler(() => access, operations)(request("/api/staff/inquiries"));
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({status: "error", code: "service_unavailable"});
  });

  it("ignores browser Staff identity headers and derives access only from the resolved principal", async () => {
    const access = authenticatedAccess();
    const reads = operations();
    const response = await createStaffInquiryListRequestHandler(() => access, () => reads)(request("/api/staff/inquiries", {
      "X-Actor-Reference": "staff:attacker",
      "X-Staff-Account-Id": "account-attacker",
      "X-Staff-Role": "ADMIN",
      "X-Team-Member-Id": "member-attacker",
    }));
    expect(response.status).toBe(200);
    expect(access.resolveSession.execute).toHaveBeenCalledWith({sessionCredential: credential});
    expect(reads.listInquiries.execute).toHaveBeenCalledWith({});
  });
});

describe("GET /api/staff/inquiries", () => {
  it("returns a safe no-store page and preserves the existing next cursor", async () => {
    const access = authenticatedAccess();
    const reads = operations();
    const response = await createStaffInquiryListRequestHandler(() => access, () => reads)(request("/api/staff/inquiries"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await body(response)).toEqual({status: "found", inquiries: [listItem], nextCursor: "next-cursor"});
  });

  it("returns an empty page", async () => {
    const reads = operations();
    reads.listInquiries.execute.mockResolvedValue({status: "found", inquiries: [], nextCursor: null});
    const response = await createStaffInquiryListRequestHandler(authenticatedAccess, () => reads)(request("/api/staff/inquiries"));
    expect(await body(response)).toEqual({status: "found", inquiries: [], nextCursor: null});
  });

  it("passes strict supported filters and the maximum valid limit to the application use case", async () => {
    const reads = operations();
    const response = await createStaffInquiryListRequestHandler(authenticatedAccess, () => reads)(request(
      "/api/staff/inquiries?status=WAITING_FOR_TEAM&assignedTeamMemberId=member-1&limit=100",
    ));
    expect(response.status).toBe(200);
    expect(reads.listInquiries.execute).toHaveBeenCalledWith({
      status: "WAITING_FOR_TEAM",
      assignment: {type: "assigned", teamMemberId: "member-1"},
      pageSize: 100,
    });
  });

  it("passes unassigned and cursor filters without decoding or replacing keyset pagination", async () => {
    const reads = operations();
    const cursor = `${encodeURIComponent("2026-08-26T08:00:00.000Z")}~inquiry-1`;
    const response = await createStaffInquiryListRequestHandler(authenticatedAccess, () => reads)(request(
      `/api/staff/inquiries?unassigned=true&cursor=${encodeURIComponent(cursor)}&limit=25`,
    ));
    expect(response.status).toBe(200);
    expect(reads.listInquiries.execute).toHaveBeenCalledWith({
      assignment: {type: "unassigned"},
      cursor,
      pageSize: 25,
    });
  });

  it.each([
    ["unsupported status", "status=UNKNOWN", "status"],
    ["zero limit", "limit=0", "limit"],
    ["negative limit", "limit=-1", "limit"],
    ["decimal limit", "limit=1.5", "limit"],
    ["empty assigned member", "assignedTeamMemberId=", "assignedTeamMemberId"],
    ["invalid unassigned flag", "unassigned=false", "unassigned"],
    ["conflicting assignment filters", "assignedTeamMemberId=member-1&unassigned=true", "assignment"],
    ["duplicate limit", "limit=25&limit=25", "limit"],
    ["unsupported identity parameter", "role=ADMIN", "role"],
  ])("returns 400 for %s", async (_label, query, field) => {
    const reads = operations();
    const response = await createStaffInquiryListRequestHandler(authenticatedAccess, () => reads)(request(`/api/staff/inquiries?${query}`));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({status: "error", code: "invalid_request", field});
    expect(reads.listInquiries.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["over-limit value", "limit=101", "pageSize"],
    ["malformed cursor", "cursor=not-a-cursor", "cursor"],
    ["oversized cursor", `cursor=${"x".repeat(513)}`, "cursor"],
    ["invalid assigned member", "assignedTeamMemberId=not%20url%20safe", "assignment"],
  ])("maps application validation for %s to 400", async (_label, query, field) => {
    const reads = operations();
    reads.listInquiries.execute.mockResolvedValue({status: "validation_failed", field: field as "pageSize" | "cursor" | "assignment"});
    const response = await createStaffInquiryListRequestHandler(authenticatedAccess, () => reads)(request(`/api/staff/inquiries?${query}`));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({status: "error", code: "invalid_request", field});
  });

  it("maps persistence failures and thrown dependencies to the same safe 503", async () => {
    const reads = operations();
    reads.listInquiries.execute.mockResolvedValueOnce({status: "persistence_failed"}).mockRejectedValueOnce(new Error("postgresql://secret"));
    const handler = createStaffInquiryListRequestHandler(authenticatedAccess, () => reads);
    for (let index = 0; index < 2; index += 1) {
      const response = await handler(request("/api/staff/inquiries"));
      expect(response.status).toBe(503);
      expect(JSON.stringify(await body(response))).not.toMatch(/postgres|secret/iu);
    }
  });

  it("serializes only the safe Team Operations list DTO", async () => {
    const response = await createStaffInquiryListRequestHandler(authenticatedAccess, operations)(request("/api/staff/inquiries"));
    const responseBody = await body(response);
    const keys = collectKeys(responseBody);
    expectKeysNotToContain(keys, forbiddenCredentialAndPricingKeys);
  });
});

describe("GET /api/staff/inquiries/[inquiryId]", () => {
  it("returns safe workflow history and conversation messages with no-store", async () => {
    const reads = operations();
    const response = await createStaffInquiryDetailRequestHandler(authenticatedAccess, () => reads)(
      request("/api/staff/inquiries/inquiry-1"),
      detailContext(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(reads.getInquiryDetail.execute).toHaveBeenCalledWith({inquiryId: "inquiry-1"});
    const responseBody = await body(response);
    expect(responseBody).toEqual({status: "found", detail});
    expect(responseBody).toMatchObject({detail: {conversationMessages: [
      {actorReference: null},
      {actorReference: "staff:member-1"},
    ]}});
    expectKeysNotToContain(collectKeys(responseBody), forbiddenCredentialAndPricingKeys);
  });

  it.each([
    ["validation_failed", 400, {status: "error", code: "invalid_request", field: "inquiryId"}],
    ["inquiry_not_found", 404, {status: "error", code: "not_found"}],
    ["persistence_failed", 503, {status: "error", code: "service_unavailable"}],
  ] as const)("maps %s safely", async (status, expectedStatus, expectedBody) => {
    const reads = operations();
    reads.getInquiryDetail.execute.mockResolvedValue({status});
    const response = await createStaffInquiryDetailRequestHandler(authenticatedAccess, () => reads)(
      request("/api/staff/inquiries/inquiry-1"),
      detailContext(status === "validation_failed" ? "invalid id" : "inquiry-1"),
    );
    expect(response.status).toBe(expectedStatus);
    expect(await body(response)).toEqual(expectedBody);
  });

  it("rejects unsupported query parameters", async () => {
    const reads = operations();
    const response = await createStaffInquiryDetailRequestHandler(authenticatedAccess, () => reads)(
      request("/api/staff/inquiries/inquiry-1?staffAccountId=attacker"),
      detailContext(),
    );
    expect(response.status).toBe(400);
    expect(reads.getInquiryDetail.execute).not.toHaveBeenCalled();
  });
});

describe("GET /api/staff/team-members", () => {
  it("returns only safe operational Team Member fields with no-store", async () => {
    const response = await createStaffTeamMembersRequestHandler(authenticatedAccess, operations)(request("/api/staff/team-members"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const responseBody = await body(response);
    expect(responseBody).toEqual({status: "found", teamMembers: [{id: "member-1", displayName: "Sales Member", active: true}]});
    expectKeysNotToContain(collectKeys(responseBody), [
      ...forbiddenCredentialAndPricingKeys,
      "email",
      "normalizedEmail",
      "staffAccountId",
      "role",
      "telegramId",
      "recipientId",
      "externalId",
    ]);
  });

  it("returns an empty operational list", async () => {
    const reads = operations();
    reads.listAssignableTeamMembers.execute.mockResolvedValue({status: "found", teamMembers: []});
    const response = await createStaffTeamMembersRequestHandler(authenticatedAccess, () => reads)(request("/api/staff/team-members"));
    expect(await body(response)).toEqual({status: "found", teamMembers: []});
  });

  it("maps persistence failure to a safe 503 and rejects query parameters", async () => {
    const reads = operations();
    reads.listAssignableTeamMembers.execute.mockResolvedValue({status: "persistence_failed"});
    const handler = createStaffTeamMembersRequestHandler(authenticatedAccess, () => reads);
    expect((await handler(request("/api/staff/team-members"))).status).toBe(503);
    const invalid = await handler(request("/api/staff/team-members?role=ADMIN"));
    expect(invalid.status).toBe(400);
  });
});
