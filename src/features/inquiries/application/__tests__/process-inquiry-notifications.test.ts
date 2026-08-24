import {describe, expect, it} from "vitest";

import type {EmailNotificationProvider, InquiryOutbox, PendingInquiryEvent, TelegramNotificationProvider} from "@/features/inquiries/application/ports/inquiry-ports";
import {ProcessInquiryNotifications} from "@/features/inquiries/application/use-cases/process-inquiry-notifications";
import {createInquiryCreated} from "@/features/inquiries/domain/events/inquiry-created";
import {FakeClock, FakeInquiryRepository} from "@/features/inquiries/testing/fakes/inquiry-fakes";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";

class FakeOutbox implements InquiryOutbox {
  processed: string[] = []; retries: Array<{id: string; at: Date}> = [];
  constructor(readonly pending: readonly PendingInquiryEvent[]) {}
  async claimPending() { return this.pending; }
  async markProcessed(id: string) { this.processed.push(id); }
  async scheduleRetry(id: string, at: Date) { this.retries.push({id, at}); }
}

describe("ProcessInquiryNotifications", () => {
  it("delivers a claimed InquiryCreated event through both provider ports", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "worker-inquiry"}).buildNew();
    const repository = new FakeInquiryRepository(); await repository.save(inquiry);
    const event = createInquiryCreated(inquiry.id.value, inquiry.createdAt);
    const outbox = new FakeOutbox([{event, attempts: 1}]);
    const calls: string[] = [];
    const telegram: TelegramNotificationProvider = {async sendInquiryCreated(eventId) { calls.push(`telegram:${eventId}`); }};
    const email: EmailNotificationProvider = {async sendInquiryCreated(eventId) { calls.push(`email:${eventId}`); }};
    const result = await new ProcessInquiryNotifications(outbox, repository, telegram, email, new FakeClock()).execute();
    expect(result).toEqual({claimed: 1, processed: 1, scheduledForRetry: 0});
    expect(calls.sort()).toEqual([`email:${event.eventId}`, `telegram:${event.eventId}`]);
    expect(outbox.processed).toEqual([event.eventId]);
  });

  it("schedules a bounded retry without exposing provider errors", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "retry-inquiry"}).buildNew();
    const repository = new FakeInquiryRepository(); await repository.save(inquiry);
    const event = createInquiryCreated(inquiry.id.value, inquiry.createdAt);
    const outbox = new FakeOutbox([{event, attempts: 2}]);
    const failing: TelegramNotificationProvider = {async sendInquiryCreated() { throw new Error("provider secret"); }};
    const email: EmailNotificationProvider = {async sendInquiryCreated() { return; }};
    const result = await new ProcessInquiryNotifications(outbox, repository, failing, email, new FakeClock()).execute();
    expect(result).toEqual({claimed: 1, processed: 0, scheduledForRetry: 1});
    expect(outbox.retries[0]).toEqual({id: event.eventId, at: new Date("2026-02-01T00:01:00.000Z")});
  });
});
