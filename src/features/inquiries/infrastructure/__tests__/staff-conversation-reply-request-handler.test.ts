import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import type {SendStaffConversationReplyResult} from "@/features/inquiries/application/results/send-staff-conversation-reply-result";
import {StaffConversationReplyRateLimiter} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-rate-limiter";
import {
  createStaffConversationReplyRequestHandler,
  staffConversationReplyRequestSizeLimit,
} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-request-handler";

const credential = `yps_${"A".repeat(43)}`;
const cookie = `yolpol_staff_session=${credential}`;
const principal: StaffPrincipal = Object.freeze({
  staffAccountId: "account-1",
  teamMemberId: "member-1",
  role: "SALES",
  displayName: "Sales Member",
  actorReference: "staff:member-1",
});
const payload = Object.freeze({
  body: "Thank you. We are reviewing your request.",
  clientMessageId: "019d-client-message-1",
});
const sentMessage = Object.freeze({
  id: `staff_web_${"a".repeat(64)}`,
  senderType: "INTERNAL_USER" as const,
  channel: "WEBSITE" as const,
  actorReference: "staff:member-1",
  body: payload.body,
  createdAt: "2026-08-26T12:00:00.000Z",
});

function access(result: Readonly<Record<string, unknown>> = {status: "authenticated", principal}) {
  return {
    resolveSession: {execute: vi.fn().mockResolvedValue(result)},
    authorization: new StaffAuthorizationPolicy(),
  };
}

function sender(result: SendStaffConversationReplyResult = {status: "sent", message: sentMessage, idempotent: false}) {
  return {execute: vi.fn().mockResolvedValue(result)};
}

function request(options: Readonly<{
  body?: BodyInit | null;
  contentType?: string | null;
  cookie?: string | null;
  origin?: string | null;
  path?: string;
}> = {}): Request {
  const headers = new Headers();
  if (options.origin !== null) headers.set("Origin", options.origin ?? "https://yolpol.com");
  if (options.cookie !== null) headers.set("Cookie", options.cookie ?? cookie);
  if (options.contentType !== null) headers.set("Content-Type", options.contentType ?? "application/json");
  return new Request(`https://yolpol.com${options.path ?? "/api/staff/inquiries/inquiry-1/messages"}`, {
    method: "POST",
    headers,
    body: options.body === undefined ? JSON.stringify(payload) : options.body,
  });
}

const context = (inquiryId = "inquiry-1") => ({params: Promise.resolve({inquiryId})});

async function responseBody(response: Response): Promise<Record<string, unknown>> {
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

const forbiddenKeys = Object.freeze([
  "price", "internalUnitPrice", "cost", "margin", "passwordHash", "sessionCredential",
  "tokenLookup", "tokenVerification", "tokenHash", "conversationAccessToken",
  "accessLookupDigest", "accessVerificationDigest", "telegramToken", "webhookSecret", "databaseUrl",
]);

function expectNoForbiddenKeys(value: unknown): void {
  const keys = collectKeys(value);
  for (const forbidden of forbiddenKeys) expect(keys.has(forbidden.toLowerCase())).toBe(false);
}

describe("Staff conversation reply response confidentiality", () => {
  it("detects a forbidden key nested inside arrays and objects", () => {
    expect(collectKeys({safe: [{nested: {conversationAccessToken: "forbidden"}}]}).has("conversationaccesstoken")).toBe(true);
  });
});

describe("POST /api/staff/inquiries/[inquiryId]/messages", () => {
  it("authenticates, authorizes, derives actor identity server-side, and returns a safe created reply", async () => {
    const staffAccess = access();
    const replySender = sender();
    const response = await createStaffConversationReplyRequestHandler(() => staffAccess, () => replySender)(request(), context());

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(staffAccess.resolveSession.execute).toHaveBeenCalledWith({sessionCredential: credential});
    expect(replySender.execute).toHaveBeenCalledWith({
      inquiryId: "inquiry-1",
      body: payload.body,
      clientMessageId: payload.clientMessageId,
      actorReference: "staff:member-1",
    });
    const body = await responseBody(response);
    expect(body).toEqual({status: "sent", message: sentMessage});
    expectNoForbiddenKeys(body);
    expect(JSON.stringify(body)).not.toContain(credential);
    expect(JSON.stringify(body)).not.toContain(principal.staffAccountId);
  });

  it.each([
    ["missing", access(), request({cookie: null})],
    ["invalid", access({status: "unauthorized"}), request()],
  ])("returns 401 for a %s Staff session", async (_label, staffAccess, staffRequest) => {
    const replySender = sender();
    const response = await createStaffConversationReplyRequestHandler(() => staffAccess, () => replySender)(staffRequest, context());
    expect(response.status).toBe(401);
    expect(await responseBody(response)).toEqual({status: "error", code: "unauthorized"});
    expect(replySender.execute).not.toHaveBeenCalled();
  });

  it("maps an empty message and invalid Inquiry ID through the application boundary", async () => {
    const emptySender = sender({status: "validation_failed", field: "body"});
    const empty = await createStaffConversationReplyRequestHandler(() => access(), () => emptySender)(
      request({body: JSON.stringify({...payload, body: "   "})}),
      context(),
    );
    expect(empty.status).toBe(400);
    expect(emptySender.execute).toHaveBeenCalledWith(expect.objectContaining({body: "   ", actorReference: "staff:member-1"}));

    const invalidInquirySender = sender({status: "validation_failed", field: "inquiryId"});
    const invalidInquiry = await createStaffConversationReplyRequestHandler(() => access(), () => invalidInquirySender)(
      request(),
      context("invalid/id"),
    );
    expect(invalidInquiry.status).toBe(400);
    expect(invalidInquirySender.execute).toHaveBeenCalledWith(expect.objectContaining({inquiryId: "invalid/id"}));
  });

  it("returns 403 when the authenticated principal lacks the reply capability", async () => {
    const staffAccess = access();
    staffAccess.authorization = {
      mayPerformTeamOperations: () => false,
      mayReplyToCustomerConversation: () => false,
      actorReferenceFor: () => { throw new Error("must not be called"); },
    } as StaffAuthorizationPolicy;
    const replySender = sender();
    const response = await createStaffConversationReplyRequestHandler(() => staffAccess, () => replySender)(request(), context());
    expect(response.status).toBe(403);
    expect(await responseBody(response)).toEqual({status: "error", code: "forbidden"});
    expect(replySender.execute).not.toHaveBeenCalled();
  });

  it.each(["persistence_failed", "dependency_failed"] as const)("maps session %s to a safe 503", async (status) => {
    const response = await createStaffConversationReplyRequestHandler(
      () => access({status}),
      () => sender(),
    )(request(), context());
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({status: "error", code: "service_unavailable"});
  });

  it("maps unexpected authentication and authorization failures to safe 503 responses", async () => {
    const authenticationFailure = await createStaffConversationReplyRequestHandler(
      () => { throw new Error("database connection details"); },
      () => sender(),
    )(request(), context());
    expect(authenticationFailure.status).toBe(503);

    const staffAccess = access();
    staffAccess.authorization.actorReferenceFor = () => { throw new Error("principal internals"); };
    const authorizationFailure = await createStaffConversationReplyRequestHandler(
      () => staffAccess,
      () => sender(),
    )(request(), context());
    expect(authorizationFailure.status).toBe(503);
  });

  it.each([null, "https://attacker.example", "https://yolpol.com/path"])("rejects the invalid Origin %s before session resolution", async (origin) => {
    const staffAccess = access();
    const response = await createStaffConversationReplyRequestHandler(() => staffAccess, () => sender())(request({origin}), context());
    expect(response.status).toBe(403);
    expect(await responseBody(response)).toEqual({status: "error", code: "invalid_origin"});
    expect(staffAccess.resolveSession.execute).not.toHaveBeenCalled();
  });

  it("uses the approved strict local-development Origin behavior", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const response = await createStaffConversationReplyRequestHandler(() => access(), () => sender(), {
        approvedDevelopmentOrigins: new Set(["http://192.168.1.100:3000"]),
        environment: {NODE_ENV: "development"},
      })(request({origin: "http://192.168.1.100:3000"}), context());
      expect(response.status).toBe(201);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects unsupported media types, malformed JSON, oversized bodies, and query parameters", async () => {
    const handler = createStaffConversationReplyRequestHandler(() => access(), () => sender());
    const unsupported = await handler(request({contentType: "text/plain"}), context());
    expect(unsupported.status).toBe(415);
    expect(await responseBody(unsupported)).toEqual({status: "error", code: "unsupported_media_type"});

    const malformed = await handler(request({body: "{"}), context());
    expect(malformed.status).toBe(400);
    expect(await responseBody(malformed)).toEqual({status: "error", code: "invalid_request", field: "request"});

    const oversized = await handler(request({body: "x".repeat(staffConversationReplyRequestSizeLimit + 1)}), context());
    expect(oversized.status).toBe(413);
    expect(await responseBody(oversized)).toEqual({status: "error", code: "payload_too_large"});

    const query = await handler(request({path: "/api/staff/inquiries/inquiry-1/messages?actorReference=staff:other"}), context());
    expect(query.status).toBe(400);
    expect(await responseBody(query)).toEqual({status: "error", code: "invalid_request", field: "query"});
  });

  it.each([
    [{body: payload.body}, "clientMessageId"],
    [{clientMessageId: payload.clientMessageId}, "body"],
    [{...payload, actorReference: "staff:other"}, "request"],
    [{...payload, teamMemberId: "member-other"}, "request"],
    [{...payload, staffAccountId: "account-other"}, "request"],
    [{...payload, role: "ADMIN"}, "request"],
  ] as const)("strictly rejects invalid or impersonating payload %#", async (invalid, field) => {
    const replySender = sender();
    const response = await createStaffConversationReplyRequestHandler(() => access(), () => replySender)(
      request({body: JSON.stringify(invalid)}),
      context(),
    );
    expect(response.status).toBe(400);
    expect(await responseBody(response)).toEqual({status: "error", code: "invalid_request", field});
    expect(replySender.execute).not.toHaveBeenCalled();
  });

  it.each([
    [{status: "validation_failed", field: "body"} as const, 400, {status: "error", code: "invalid_request", field: "body"}],
    [{status: "validation_failed", field: "inquiryId"} as const, 400, {status: "error", code: "invalid_request", field: "inquiryId"}],
    [{status: "inquiry_not_found"} as const, 404, {status: "error", code: "not_found"}],
    [{status: "conversation_not_found"} as const, 404, {status: "error", code: "not_found"}],
    [{status: "conflict"} as const, 409, {status: "error", code: "conflict"}],
    [{status: "persistence_failed"} as const, 503, {status: "error", code: "service_unavailable"}],
    [{status: "dependency_failed"} as const, 503, {status: "error", code: "service_unavailable"}],
  ])("maps application result %# safely", async (result, expectedStatus, expectedBody) => {
    const response = await createStaffConversationReplyRequestHandler(() => access(), () => sender(result))(request(), context());
    expect(response.status).toBe(expectedStatus);
    const body = await responseBody(response);
    expect(body).toEqual(expectedBody);
    expectNoForbiddenKeys(body);
  });

  it("returns an idempotent retry as 200 with the original safe message", async () => {
    const response = await createStaffConversationReplyRequestHandler(
      () => access(),
      () => sender({status: "sent", message: sentMessage, idempotent: true}),
    )(request(), context());
    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({status: "sent", message: sentMessage});
  });

  it("rate limits only after authentication and authorization", async () => {
    const limiter = new StaffConversationReplyRateLimiter({maxRequests: 1, windowMs: 60_000}, () => 1_000);
    const handler = createStaffConversationReplyRequestHandler(() => access(), () => sender(), {rateLimiter: limiter});
    expect((await handler(request(), context())).status).toBe(201);
    const limited = await handler(request(), context());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
  });

  it("maps route-context and unexpected sender failures without leaking details", async () => {
    const invalidContext = await createStaffConversationReplyRequestHandler(() => access(), () => sender())(
      request(),
      {params: Promise.reject(new Error("route internals"))},
    );
    expect(invalidContext.status).toBe(400);

    const replySender = sender();
    replySender.execute.mockRejectedValue(new Error("postgres constraint secret"));
    const unavailable = await createStaffConversationReplyRequestHandler(() => access(), () => replySender)(request(), context());
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await responseBody(unavailable))).not.toContain("postgres");
  });
});
