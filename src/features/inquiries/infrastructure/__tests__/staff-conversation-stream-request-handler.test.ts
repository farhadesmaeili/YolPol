import {afterEach, describe, expect, it, vi} from "vitest";

import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import type {ConversationMessageUpdate} from "@/features/inquiries/application/ports/conversation-stream-ports";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {createStaffConversationStreamRequestHandler} from "@/features/inquiries/infrastructure/http/staff-conversation-stream-request-handler";

const credential = `yps_${"A".repeat(43)}`;
const principal: StaffPrincipal = {staffAccountId: "account-1", teamMemberId: "member-1", role: "SALES", displayName: "Sales", actorReference: "staff:member-1"};
const context = (inquiryId = "inquiry-1") => ({params: Promise.resolve({inquiryId})});
const message = (change: Partial<StaffConversationMessageDto> = {}): StaffConversationMessageDto => Object.freeze({
  id: "message-2",
  senderType: "CUSTOMER",
  channel: "WEBSITE",
  actorReference: null,
  body: "Realtime customer test",
  createdAt: "2026-08-28T10:00:00.000Z",
  ...change,
});

function request(input: Readonly<{
  cookie?: string | null;
  cursor?: string;
  lastEventId?: string;
  signal?: AbortSignal;
}> = {}) {
  const headers = new Headers({Origin: "https://yolpol.com"});
  if (input.cookie !== null) headers.set("Cookie", input.cookie ?? `yolpol_staff_session=${credential}`);
  if (input.lastEventId !== undefined) headers.set("Last-Event-ID", input.lastEventId);
  const query = input.cursor === undefined ? "" : `?cursor=${encodeURIComponent(input.cursor)}`;
  return new Request(`https://yolpol.com/api/staff/inquiries/inquiry-1/stream${query}`, {headers, signal: input.signal});
}

function access(allowed = true) {
  const authorization = new StaffAuthorizationPolicy();
  if (!allowed) authorization.mayReplyToCustomerConversation = () => false;
  return {resolveSession: {execute: vi.fn().mockResolvedValue({status: "authenticated", principal})}, authorization};
}

type StreamInput = Readonly<{
  conversationId: string;
  inquiryId: string;
  afterCursor: number;
  signal: AbortSignal;
  onUpdate(update: ConversationMessageUpdate<StaffConversationMessageDto>): void;
  onUnavailable(): void;
}>;

function dependencies() {
  let streamInput: StreamInput | undefined;
  let typingListener: ((event: Readonly<{participant: "CUSTOMER"; isTyping: boolean}>) => void) | undefined;
  const closeStream = vi.fn();
  const closeTyping = vi.fn();
  const open = vi.fn((input: StreamInput) => {
    streamInput = input;
    return {status: "opened", session: {close: closeStream, completed: new Promise<void>(() => undefined)}} as const;
  });
  const registry = {
    update: vi.fn(),
    subscribe: vi.fn((input: Readonly<{conversationId: string; participant: string; listener(event: Readonly<{participant: "CUSTOMER"; isTyping: boolean}>): void}>) => {
      typingListener = input.listener;
      return {close: closeTyping};
    }),
  };
  return {
    closeStream,
    closeTyping,
    get streamInput() { return streamInput; },
    get typingListener() { return typingListener; },
    open,
    registry,
  };
}

afterEach(() => vi.useRealTimers());

describe("GET /api/staff/inquiries/[inquiryId]/stream", () => {
  it("authenticates, authorizes, resumes after initial history, and multiplexes safe persisted messages with typing", async () => {
    const deps = dependencies();
    const response = await createStaffConversationStreamRequestHandler(
      () => access(),
      () => ({execute: vi.fn().mockResolvedValue({status: "resolved", conversationId: "conversation-1"})}),
      () => ({open: deps.open}),
      () => deps.registry,
      {heartbeatIntervalMs: 60_000},
    )(request({cursor: "1"}), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(deps.open).toHaveBeenCalledWith(expect.objectContaining({conversationId: "conversation-1", inquiryId: "inquiry-1", afterCursor: 1}));
    expect(deps.registry.subscribe).toHaveBeenCalledWith(expect.objectContaining({conversationId: "conversation-1", participant: "CUSTOMER"}));

    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(": connected");

    deps.streamInput!.onUpdate({cursor: 2, message: message()});
    const persisted = new TextDecoder().decode((await reader.read()).value);
    expect(persisted).toBe(`id: 2\nevent: message\ndata: ${JSON.stringify(message())}\n\n`);
    expect(persisted).not.toMatch(/account-1|yps_|database|token|secret/u);

    deps.typingListener!({participant: "CUSTOMER", isTyping: true});
    const typing = new TextDecoder().decode((await reader.read()).value);
    expect(typing).toBe('event: typing\ndata: {"participant":"CUSTOMER","isTyping":true}\n\n');
    expect(typing).not.toMatch(/^id:/mu);

    await reader.cancel();
    expect(deps.closeStream).toHaveBeenCalledOnce();
    expect(deps.closeTyping).toHaveBeenCalledOnce();
  });

  it("uses Last-Event-ID on reconnect and can deliver provider-neutral Telegram messages", async () => {
    const deps = dependencies();
    const response = await createStaffConversationStreamRequestHandler(
      () => access(),
      () => ({execute: vi.fn().mockResolvedValue({status: "resolved", conversationId: "conversation-1"})}),
      () => ({open: deps.open}),
      () => deps.registry,
      {heartbeatIntervalMs: 60_000},
    )(request({cursor: "1", lastEventId: "4"}), context());

    expect(deps.open).toHaveBeenCalledWith(expect.objectContaining({afterCursor: 4}));
    const reader = response.body!.getReader();
    await reader.read();
    const telegramMessage = message({id: "telegram-message-5", senderType: "INTERNAL_USER", channel: "TELEGRAM", body: "Telegram Staff reply"});
    deps.streamInput!.onUpdate({cursor: 5, message: telegramMessage});
    const frame = new TextDecoder().decode((await reader.read()).value);
    expect(frame).toContain("id: 5\nevent: message");
    expect(frame).toContain('"channel":"TELEGRAM"');
    await reader.cancel();
  });

  it.each([
    ["unauthenticated", request({cookie: null}), access(), 401],
    ["forbidden", request(), access(false), 403],
  ])("rejects %s Staff access before resolving or streaming the inquiry", async (_label, staffRequest, staffAccess, status) => {
    const deps = dependencies();
    const resolve = vi.fn();
    const response = await createStaffConversationStreamRequestHandler(
      () => staffAccess,
      () => ({execute: resolve}),
      () => ({open: deps.open}),
      () => deps.registry,
    )(staffRequest, context());
    expect(response.status).toBe(status);
    expect(resolve).not.toHaveBeenCalled();
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.registry.subscribe).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin stream before Staff session resolution", async () => {
    const deps = dependencies();
    const staffAccess = access();
    const crossOrigin = request({cursor: "0"});
    crossOrigin.headers.set("Origin", "https://attacker.example");
    const response = await createStaffConversationStreamRequestHandler(
      () => staffAccess,
      () => ({execute: vi.fn()}),
      () => ({open: deps.open}),
      () => deps.registry,
    )(crossOrigin, context());

    expect(response.status).toBe(403);
    expect(staffAccess.resolveSession.execute).not.toHaveBeenCalled();
    expect(deps.open).not.toHaveBeenCalled();
  });

  it("rejects absent conversations and malformed cursors without allocating stream resources", async () => {
    const deps = dependencies();
    const missing = await createStaffConversationStreamRequestHandler(
      () => access(),
      () => ({execute: vi.fn().mockResolvedValue({status: "conversation_not_found"})}),
      () => ({open: deps.open}),
      () => deps.registry,
    )(request({cursor: "0"}), context("inquiry-2"));
    expect(missing.status).toBe(404);

    const invalid = await createStaffConversationStreamRequestHandler(
      () => access(),
      () => ({execute: vi.fn()}),
      () => ({open: deps.open}),
      () => deps.registry,
    )(request({cursor: "not-a-cursor"}), context());
    expect(invalid.status).toBe(400);
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.registry.subscribe).not.toHaveBeenCalled();
  });

  it("emits ID-less heartbeats and closes both persisted and typing work when aborted", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const deps = dependencies();
    const response = await createStaffConversationStreamRequestHandler(
      () => access(),
      () => ({execute: vi.fn().mockResolvedValue({status: "resolved", conversationId: "conversation-1"})}),
      () => ({open: deps.open}),
      () => deps.registry,
      {heartbeatIntervalMs: 10},
    )(request({cursor: "-1", signal: abort.signal}), context());
    const reader = response.body!.getReader();
    await reader.read();
    await vi.advanceTimersByTimeAsync(10);
    const heartbeat = new TextDecoder().decode((await reader.read()).value);
    expect(heartbeat).toBe(": keep-alive\n\n");
    expect(heartbeat).not.toMatch(/^id:/mu);

    abort.abort();
    expect(deps.closeStream).toHaveBeenCalledOnce();
    expect(deps.closeTyping).toHaveBeenCalledOnce();
    await expect(reader.read()).resolves.toMatchObject({done: true});
  });
});
