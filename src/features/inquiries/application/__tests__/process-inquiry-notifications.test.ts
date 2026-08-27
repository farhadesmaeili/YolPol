import {describe, expect, it, vi} from "vitest";

import type {TelegramDeliveryRepository, TelegramMessageTransport} from "@/features/inquiries/application/ports/communication-ports";
import type {InquiryNotificationConversationReader} from "@/features/inquiries/application/ports/conversation-ports";
import type {InquiryOutbox, PendingInquiryEvent} from "@/features/inquiries/application/ports/inquiry-ports";
import {ProcessInquiryNotifications} from "@/features/inquiries/application/use-cases/process-inquiry-notifications";
import type {ClaimedTelegramDelivery, TelegramDeliveryErrorCode, TelegramDeliveryStatus} from "@/features/inquiries/application/types/telegram-delivery";
import {Message} from "@/features/inquiries/domain/entities/message";
import {createCustomerConversationMessageCreated} from "@/features/inquiries/domain/events/customer-conversation-message-created";
import {createInquiryCreated} from "@/features/inquiries/domain/events/inquiry-created";
import {FakeClock, FakeInquiryRepository} from "@/features/inquiries/testing/fakes/inquiry-fakes";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";

class FakeOutbox implements InquiryOutbox {
  readonly pending: PendingInquiryEvent[];
  processed: string[] = [];
  retries: Array<{id: string; at: Date}> = [];
  constructor(pending: readonly PendingInquiryEvent[]) { this.pending = [...pending]; }
  async claimPending() { return this.pending.splice(0, 1); }
  async markProcessed(id: string) { this.processed.push(id); }
  async scheduleRetry(id: string, at: Date) { this.retries.push({id, at}); }
}

type Mutable<T> = {-readonly [Property in keyof T]: T[Property]};
type FakeRow = Mutable<ClaimedTelegramDelivery> & {status: TelegramDeliveryStatus; availableAt: Date; lastErrorCode: TelegramDeliveryErrorCode | null};
class FakeDeliveries implements TelegramDeliveryRepository {
  readonly rows: FakeRow[];
  constructor(eventId: string, recipients: readonly Readonly<{id: string; externalId: string; kind: "TEAM_GROUP" | "TEAM_MEMBER"}>[]) {
    this.rows = recipients.map(({id, externalId, kind}) => ({outboxEventId: eventId, recipientId: id, conversationId: "conversation-1", recipientKind: kind, recipientExternalId: externalId, attempts: 0, status: "PENDING", availableAt: new Date("2026-02-01T00:00:00.000Z"), lastErrorCode: null}));
  }
  async snapshotRecipients() { return this.rows.length; }
  async claimDue({outboxEventId, now}: {outboxEventId: string; limit: number; now: Date}) {
    return this.rows.filter((row) => row.outboxEventId === outboxEventId && ["PENDING", "RETRYABLE_FAILURE"].includes(row.status) && row.availableAt <= now).map((row) => { row.status = "IN_FLIGHT"; row.attempts += 1; return Object.freeze({...row}); });
  }
  async markDelivered({delivery}: Parameters<TelegramDeliveryRepository["markDelivered"]>[0]) { this.set(delivery, "DELIVERED", null); }
  async markRetryable({delivery, errorCode, availableAt}: Parameters<TelegramDeliveryRepository["markRetryable"]>[0]) { const row = this.set(delivery, "RETRYABLE_FAILURE", errorCode); row.availableAt = availableAt; }
  async markPermanentFailure({delivery, errorCode}: Parameters<TelegramDeliveryRepository["markPermanentFailure"]>[0]) { this.set(delivery, "PERMANENT_FAILURE", errorCode); }
  async markUnknown({delivery, errorCode}: Parameters<TelegramDeliveryRepository["markUnknown"]>[0]) { this.set(delivery, "UNKNOWN", errorCode); }
  async summarizeEvent(outboxEventId: string) {
    const rows = this.rows.filter((row) => row.outboxEventId === outboxEventId);
    const automatic = rows.filter((row) => ["PENDING", "IN_FLIGHT", "RETRYABLE_FAILURE"].includes(row.status));
    return {total: rows.length, automaticWorkRemaining: automatic.length, nextAutomaticWorkAt: automatic.map(({availableAt}) => availableAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null, delivered: rows.filter(({status}) => status === "DELIVERED").length, permanentFailures: rows.filter(({status}) => status === "PERMANENT_FAILURE").length, unknown: rows.filter(({status}) => status === "UNKNOWN").length};
  }
  async findConversationByProviderMessage() { return null; }
  private set(delivery: ClaimedTelegramDelivery, status: TelegramDeliveryStatus, errorCode: TelegramDeliveryErrorCode | null) { const row = this.rows.find(({recipientId}) => recipientId === delivery.recipientId)!; row.status = status; row.lastErrorCode = errorCode; return row; }
}

const inquiryCreatedConversations: InquiryNotificationConversationReader = {
  async findConversationIdForInquiry() { return "conversation-1"; },
  async findCustomerWebsiteMessage() { return null; },
};
const notificationFormatter = {
  formatInquiryCreated: () => ({text: "Inquiry"}),
  formatCustomerConversationMessageCreated: () => ({text: "Customer message"}),
};

function context(recipients = [{id: "group", externalId: "-100", kind: "TEAM_GROUP" as const}, {id: "staff-a", externalId: "101", kind: "TEAM_MEMBER" as const}, {id: "staff-b", externalId: "102", kind: "TEAM_MEMBER" as const}]) {
  const inquiry = new InquiryTestBuilder().with({id: "worker-inquiry"}).buildNew();
  const event = createInquiryCreated(inquiry.id.value, inquiry.createdAt);
  const repository = new FakeInquiryRepository();
  const outbox = new FakeOutbox([{event, attempts: 1}]);
  const deliveries = new FakeDeliveries(event.eventId, recipients);
  return {inquiry, event, repository, outbox, deliveries};
}

describe("ProcessInquiryNotifications", () => {
  it("delivers group and private snapshots and completes the event", async () => {
    const value = context(); await value.repository.save(value.inquiry);
    const telegram: TelegramMessageTransport = {async sendMessage({recipientExternalId}) { return {status: "delivered", telegramChatId: Number(recipientExternalId), telegramMessageId: Math.abs(Number(recipientExternalId))}; }};
    const result = await new ProcessInquiryNotifications(value.outbox, value.repository, inquiryCreatedConversations, value.deliveries, telegram, notificationFormatter, new FakeClock()).execute();
    expect(result).toEqual({claimed: 1, processed: 1, scheduledForRetry: 0, delivered: 3, permanentFailures: 0, unknown: 0});
    expect(value.outbox.processed).toEqual([value.event.eventId]);
  });

  it("retries only the failed private recipient after partial delivery", async () => {
    const value = context(); await value.repository.save(value.inquiry);
    const calls: string[] = [];
    const telegram: TelegramMessageTransport = {async sendMessage({recipientExternalId}) { calls.push(recipientExternalId); return recipientExternalId === "102" && calls.filter((id) => id === "102").length === 1 ? {status: "retryable_failure", errorCode: "RATE_LIMITED", retryAfterSeconds: 120} : {status: "delivered", telegramChatId: Number(recipientExternalId), telegramMessageId: Math.abs(Number(recipientExternalId))}; }};
    const create = (outbox: FakeOutbox, clock: FakeClock) => new ProcessInquiryNotifications(outbox, value.repository, inquiryCreatedConversations, value.deliveries, telegram, notificationFormatter, clock);
    await expect(create(value.outbox, new FakeClock()).execute()).resolves.toMatchObject({processed: 0, delivered: 2, scheduledForRetry: 1});
    expect(value.deliveries.rows.map(({recipientId, status}) => ({recipientId, status}))).toEqual([{recipientId: "group", status: "DELIVERED"}, {recipientId: "staff-a", status: "DELIVERED"}, {recipientId: "staff-b", status: "RETRYABLE_FAILURE"}]);
    expect(value.deliveries.rows[2]?.availableAt).toEqual(new Date("2026-02-01T00:02:00.000Z"));
    expect(value.outbox.retries).toEqual([{id: value.event.eventId, at: new Date("2026-02-01T00:02:00.000Z")}]);
    const retryOutbox = new FakeOutbox([{event: value.event, attempts: 2}]);
    await expect(create(retryOutbox, new FakeClock(new Date("2026-02-01T00:02:00.000Z"))).execute()).resolves.toMatchObject({processed: 1, delivered: 1});
    expect(calls).toEqual(["-100", "101", "102", "102"]);
  });

  it("keeps invalid Bot credentials retryable so corrected configuration can deliver the same snapshots", async () => {
    const value = context(); await value.repository.save(value.inquiry);
    let credentialsCorrected = false;
    const calls: string[] = [];
    const telegram: TelegramMessageTransport = {async sendMessage({recipientExternalId}) {
      calls.push(recipientExternalId);
      return credentialsCorrected
        ? {status: "delivered", telegramChatId: Number(recipientExternalId), telegramMessageId: Math.abs(Number(recipientExternalId))}
        : {status: "retryable_failure", errorCode: "INVALID_BOT_TOKEN"};
    }};
    const create = (outbox: FakeOutbox, clock: FakeClock) => new ProcessInquiryNotifications(outbox, value.repository, inquiryCreatedConversations, value.deliveries, telegram, notificationFormatter, clock);

    await expect(create(value.outbox, new FakeClock()).execute()).resolves.toMatchObject({processed: 0, scheduledForRetry: 1, permanentFailures: 0});
    expect(value.deliveries.rows.map(({status, lastErrorCode}) => ({status, lastErrorCode}))).toEqual([
      {status: "RETRYABLE_FAILURE", lastErrorCode: "INVALID_BOT_TOKEN"},
      {status: "RETRYABLE_FAILURE", lastErrorCode: "INVALID_BOT_TOKEN"},
      {status: "RETRYABLE_FAILURE", lastErrorCode: "INVALID_BOT_TOKEN"},
    ]);
    expect(value.outbox.processed).toEqual([]);

    credentialsCorrected = true;
    const retryOutbox = new FakeOutbox([{event: value.event, attempts: 2}]);
    await expect(create(retryOutbox, new FakeClock(new Date("2026-02-01T00:00:30.000Z"))).execute()).resolves.toMatchObject({processed: 1, delivered: 3});
    expect(calls).toEqual(["-100", "101", "102", "-100", "101", "102"]);
  });

  it("uses bounded backoff for a known Telegram server failure", async () => {
    const value = context([{id: "staff", externalId: "101", kind: "TEAM_MEMBER"}]); await value.repository.save(value.inquiry);
    const telegram: TelegramMessageTransport = {async sendMessage() { return {status: "retryable_failure", errorCode: "TELEGRAM_SERVER_ERROR"}; }};
    const result = await new ProcessInquiryNotifications(value.outbox, value.repository, inquiryCreatedConversations, value.deliveries, telegram, notificationFormatter, new FakeClock()).execute();
    expect(result).toMatchObject({processed: 0, scheduledForRetry: 1});
    expect(value.deliveries.rows[0]).toMatchObject({status: "RETRYABLE_FAILURE", attempts: 1, availableAt: new Date("2026-02-01T00:00:30.000Z")});
  });

  it.each(["PENDING", "IN_FLIGHT"] as const)("does not complete an event while a delivery remains %s", async (status) => {
    const value = context([{id: "staff", externalId: "101", kind: "TEAM_MEMBER"}]); await value.repository.save(value.inquiry);
    value.deliveries.rows[0]!.status = status;
    value.deliveries.rows[0]!.availableAt = new Date("2026-02-01T00:01:00.000Z");
    const telegram: TelegramMessageTransport = {sendMessage: vi.fn()};
    const result = await new ProcessInquiryNotifications(value.outbox, value.repository, inquiryCreatedConversations, value.deliveries, telegram, notificationFormatter, new FakeClock()).execute();
    expect(result).toMatchObject({processed: 0, scheduledForRetry: 1, delivered: 0});
    expect(value.outbox.processed).toEqual([]);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it("treats permanent and ambiguous outcomes as terminal without resending", async () => {
    const value = context(); await value.repository.save(value.inquiry);
    const telegram: TelegramMessageTransport = {sendMessage: vi.fn(async ({recipientExternalId}) => recipientExternalId === "-100" ? {status: "delivered", telegramChatId: -100, telegramMessageId: 1} as const : recipientExternalId === "101" ? {status: "permanent_failure", errorCode: "RECIPIENT_FORBIDDEN"} as const : {status: "unknown", errorCode: "NETWORK_OUTCOME_UNKNOWN"} as const)};
    const result = await new ProcessInquiryNotifications(value.outbox, value.repository, inquiryCreatedConversations, value.deliveries, telegram, notificationFormatter, new FakeClock()).execute();
    expect(result).toMatchObject({processed: 1, delivered: 1, permanentFailures: 1, unknown: 1});
    expect(value.deliveries.rows.map(({status}) => status)).toEqual(["DELIVERED", "PERMANENT_FAILURE", "UNKNOWN"]);
  });

  it("ends known retries at the fifth automatic attempt", async () => {
    const value = context([{id: "staff", externalId: "101", kind: "TEAM_MEMBER"}]); await value.repository.save(value.inquiry);
    value.deliveries.rows[0]!.attempts = 4;
    const telegram: TelegramMessageTransport = {async sendMessage() { return {status: "retryable_failure", errorCode: "TELEGRAM_SERVER_ERROR"}; }};
    const result = await new ProcessInquiryNotifications(value.outbox, value.repository, inquiryCreatedConversations, value.deliveries, telegram, notificationFormatter, new FakeClock()).execute();
    expect(result).toMatchObject({processed: 1, permanentFailures: 1});
    expect(value.deliveries.rows[0]).toMatchObject({status: "PERMANENT_FAILURE", lastErrorCode: "RETRY_EXHAUSTED", attempts: 5});
  });

  it("dispatches a customer-message event to independent group and private deliveries", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "customer-message-inquiry"}).buildNew();
    const customerMessage = Message.create({
      id: "customer-message-1",
      senderType: "CUSTOMER",
      channel: "WEBSITE",
      body: "Please send the revised schedule.",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    const event = createCustomerConversationMessageCreated({
      eventId: "customer-message-event-1",
      inquiryId: inquiry.id.value,
      conversationId: "conversation-1",
      messageId: customerMessage.id.value,
      occurredAt: customerMessage.createdAt,
    });
    const repository = new FakeInquiryRepository();
    await repository.save(inquiry);
    const outbox = new FakeOutbox([{event, attempts: 1}]);
    const deliveries = new FakeDeliveries(event.eventId, [
      {id: "group", externalId: "-100", kind: "TEAM_GROUP"},
      {id: "staff", externalId: "101", kind: "TEAM_MEMBER"},
    ]);
    const conversations: InquiryNotificationConversationReader = {
      findConversationIdForInquiry: vi.fn(),
      findCustomerWebsiteMessage: vi.fn().mockResolvedValue(customerMessage),
    };
    const formatter = {
      formatInquiryCreated: vi.fn(),
      formatCustomerConversationMessageCreated: vi.fn().mockReturnValue({text: "NEW CUSTOMER MESSAGE"}),
    };
    const sendMessage = vi.fn<TelegramMessageTransport["sendMessage"]>(async ({recipientExternalId}) => ({
      status: "delivered",
      telegramChatId: Number(recipientExternalId),
      telegramMessageId: Math.abs(Number(recipientExternalId)),
    }));

    await expect(new ProcessInquiryNotifications(
      outbox,
      repository,
      conversations,
      deliveries,
      {sendMessage},
      formatter,
      new FakeClock(),
    ).execute()).resolves.toEqual({claimed: 1, processed: 1, scheduledForRetry: 0, delivered: 2, permanentFailures: 0, unknown: 0});
    expect(conversations.findCustomerWebsiteMessage).toHaveBeenCalledWith({
      inquiryId: inquiry.id.value,
      conversationId: "conversation-1",
      messageId: customerMessage.id.value,
    });
    expect(conversations.findConversationIdForInquiry).not.toHaveBeenCalled();
    expect(formatter.formatCustomerConversationMessageCreated).toHaveBeenCalledWith(inquiry, "conversation-1", customerMessage);
    expect(formatter.formatInquiryCreated).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls.map(([input]) => input.recipientExternalId)).toEqual(["-100", "101"]);
  });
});
