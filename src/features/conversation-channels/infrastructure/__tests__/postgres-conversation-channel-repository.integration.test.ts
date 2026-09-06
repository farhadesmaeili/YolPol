import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";

import {CreateConversationChannelBinding} from "@/features/conversation-channels/application/use-cases/create-conversation-channel-binding";
import {ProcessConversationChannelDeliveries} from "@/features/conversation-channels/application/use-cases/process-conversation-channel-deliveries";
import {RecordInboundChannelText} from "@/features/conversation-channels/application/use-cases/record-inbound-channel-text";
import {ScheduleConversationChannelDelivery} from "@/features/conversation-channels/application/use-cases/schedule-conversation-channel-delivery";
import {PostgresConversationChannelRepository} from "@/features/conversation-channels/infrastructure/persistence/postgres/repositories/postgres-conversation-channel-repository";
import {FakeConversationChannelOutboundAdapter} from "@/features/conversation-channels/testing/fakes/conversation-channel-fakes";
import {PostgresTranslationJobRepository} from "@/features/conversation-translation/infrastructure/persistence/postgres-translation-job-repository";
import {Conversation} from "@/features/inquiries/domain/entities/conversation";
import {Message} from "@/features/inquiries/domain/entities/message";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {PostgresInquiryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-repository";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";

let pool: Pool;
let idSequence = 0;
let currentTime = new Date("2026-09-06T10:00:00.000Z");
const clock = {now: () => new Date(currentTime)};
const ids = {generate: () => `channel-id-${++idSequence}`};
const leases = {generate: () => `lease-${++idSequence}`};
const identity = {
  channel: "TELEGRAM" as const,
  providerKey: "telegram_primary",
  externalAccountReference: "account-1",
  externalConversationReference: "chat-42",
  externalParticipantReference: "participant-7",
};

async function clean(): Promise<void> {
  await pool.query(`truncate table
    conversation_channel_deliveries,conversation_channel_inbound_messages,conversation_channel_bindings,
    conversation_translation_events,conversation_translation_jobs,conversation_message_translations,conversation_message_languages,
    conversation_ai_control_events,conversation_ai_controls,conversation_ai_response_jobs,
    ai_schedule_windows,ai_policy_events,ai_operation_policy,telegram_connection_requests,telegram_staff_links,
    staff_sessions,staff_invitations,staff_accounts,telegram_inquiry_deliveries,communication_recipients,
    conversation_access,conversation_messages,inquiry_assignments,inquiry_workflow_events,conversations,
    inquiry_outbox,inquiry_items,inquiry_team_members,inquiries`);
}

async function seed(suffix = "one"): Promise<{conversationId: string; inquiryId: string}> {
  const inquiryId = `channel-inquiry-${suffix}`;
  const conversationId = `channel-conversation-${suffix}`;
  const inquiry = new InquiryTestBuilder().with({id: inquiryId, source: {locale: "tr", path: "/tr/inquiry"}, createdAt: currentTime}).buildNew();
  const conversation = Conversation.start({id: conversationId, inquiryId, channel: "WEBSITE", createdAt: currentTime});
  await new PostgresInquiryRepository(pool).save(inquiry, undefined, conversation);
  return {conversationId, inquiryId};
}

async function readyDelivery(body = "Safe Turkish text") {
  const {conversationId} = await seed();
  const repository = new PostgresConversationChannelRepository(pool, leases);
  const binding = await new CreateConversationChannelBinding(repository, ids, clock).execute({conversationId, ...identity});
  if (binding.status !== "created") throw new Error("Binding setup failed.");
  await new PostgresConversationMessageRepository(pool).appendForConversation(conversationId, Message.create({
    id: "ready-message", senderType: "INTERNAL_USER", channel: "WEBSITE", sourceLocale: "tr", body, createdAt: currentTime,
  }));
  const schedule = new ScheduleConversationChannelDelivery(repository, ids, clock);
  const delivery = await schedule.execute({messageId: "ready-message", bindingId: binding.bindingId});
  if (delivery.status !== "scheduled") throw new Error("Delivery setup failed.");
  return {repository, bindingId: binding.bindingId, deliveryId: delivery.deliveryId, conversationId, schedule};
}

beforeAll(async () => {
  pool = new Pool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool), {migrationsFolder: resolve("drizzle")});
});
beforeEach(async () => { idSequence = 0; currentTime = new Date("2026-09-06T10:00:00.000Z"); await clean(); });
afterAll(async () => { if (pool) { await clean(); await pool.end(); } });

describe("PostgreSQL Conversation Channel foundation", () => {
  it("resolves simultaneous binding ownership and inbound replay without duplicate rows", async () => {
    const first = await seed("one");
    const second = await seed("two");
    const repository = new PostgresConversationChannelRepository(pool, leases);
    const bind = new CreateConversationChannelBinding(repository, ids, clock);
    const results = await Promise.all([first, second].map(({conversationId}) => bind.execute({conversationId, ...identity})));
    expect(results.map(({status}) => status).sort()).toEqual(["conflict", "created"]);
    const inbound = new RecordInboundChannelText(repository, repository, ids, clock);
    const event = {...identity, externalMessageReference: "concurrent-message", body: "Original", occurredAt: currentTime};
    expect((await Promise.all([inbound.execute(event), inbound.execute(event)])).map(({status}) => status).sort()).toEqual(["duplicate", "recorded"]);
    const conflicts = await Promise.all(["First body", "Second body"].map((body) => inbound.execute({...event, externalMessageReference: "conflicting-message", body})));
    expect(conflicts.map(({status}) => status).sort()).toEqual(["conflict", "recorded"]);
    expect(await inbound.execute({...event, occurredAt: new Date(currentTime.getTime() + 1)})).toEqual({status: "conflict"});
    expect(await inbound.execute({...event, externalParticipantReference: "different-participant"})).toEqual({status: "unresolved_binding"});
    expect((await pool.query("select count(*)::int as count from conversation_channel_inbound_messages")).rows[0].count).toBe(2);
    expect((await pool.query("select count(*)::int as count from conversation_messages")).rows[0].count).toBe(0);
  });

  it("allows separate channel/account/provider identities and preserves opaque case", async () => {
    const {conversationId} = await seed();
    const repository = new PostgresConversationChannelRepository(pool, leases);
    const bind = new CreateConversationChannelBinding(repository, ids, clock);
    for (const variant of [identity, {...identity, channel: "INSTAGRAM"}, {...identity, providerKey: "secondary"},
      {...identity, externalAccountReference: "account-2"}, {...identity, externalConversationReference: "Chat-42"}]) {
      expect(await bind.execute({conversationId, ...variant})).toMatchObject({status: "created"});
    }
    expect(await bind.execute({conversationId, ...identity, externalParticipantReference: "different"})).toEqual({status: "conflict"});
  });

  it("deduplicates simultaneous scheduling and fences all finalizers after a new retry lease", async () => {
    const {repository, bindingId, schedule, deliveryId} = await readyDelivery();
    await pool.query("delete from conversation_channel_deliveries where id=$1", [deliveryId]);
    const results = await Promise.all([schedule.execute({messageId: "ready-message", bindingId}), schedule.execute({messageId: "ready-message", bindingId})]);
    expect(results.map(({status}) => status).sort()).toEqual(["duplicate", "scheduled"]);
    const [first] = await repository.claimDue({limit: 1, now: currentTime, leaseMilliseconds: 60_000});
    expect(await repository.markRetryable({job: first!, category: "RATE_LIMITED", now: currentTime, availableAt: currentTime})).toBe("rescheduled");
    const [second] = await repository.claimDue({limit: 1, now: currentTime, leaseMilliseconds: 60_000});
    expect(second!.leaseToken).not.toBe(first!.leaseToken);
    expect(await repository.isLeaseCurrent({job: first!, now: currentTime})).toBe(false);
    expect(await repository.isLeaseCurrent({job: second!, now: currentTime})).toBe(true);
    expect(await repository.markDelivered({job: first!, now: currentTime, providerMessageReference: "late"})).toBe(false);
    expect(await repository.markFailed({job: first!, now: currentTime, category: "INVALID_REQUEST"})).toBe(false);
    expect(await repository.markUnknown({job: first!, now: currentTime})).toBe(false);
    expect(await repository.markRetryable({job: first!, now: currentTime, availableAt: currentTime, category: "RATE_LIMITED"})).toBe("stale_lease");
    expect(await repository.markDelivered({job: second!, now: currentTime, providerMessageReference: "confirmed"})).toBe(true);
    expect(await repository.markRetryable({job: second!, now: currentTime, availableAt: currentTime, category: "RATE_LIMITED"})).toBe("stale_lease");
    expect(await repository.claimDue({limit: 1, now: currentTime, leaseMilliseconds: 60_000})).toEqual([]);
  });

  it("stops at exactly three confirmed-not-sent attempts and respects retry delays", async () => {
    const {repository} = await readyDelivery();
    const adapter = new FakeConversationChannelOutboundAdapter();
    adapter.result = {status: "RETRYABLE_FAILURE", failureCategory: "RATE_LIMITED"};
    const worker = new ProcessConversationChannelDeliveries(repository, adapter, clock);
    for (const delay of [1_000, 2_000]) {
      expect(await worker.execute()).toMatchObject({claimed: 1, retried: 1});
      expect(await worker.execute()).toMatchObject({claimed: 0});
      currentTime = new Date(currentTime.getTime() + delay);
    }
    expect(await worker.execute()).toMatchObject({claimed: 1, failed: 1});
    currentTime = new Date(currentTime.getTime() + 300_000);
    expect(await worker.execute()).toMatchObject({claimed: 0});
    expect(adapter.requests).toHaveLength(3);
    expect(new Set(adapter.requests.map(({idempotencyReference}) => idempotencyReference)).size).toBe(1);
    expect((await pool.query("select status,attempts from conversation_channel_deliveries")).rows[0]).toEqual({status: "FAILED", attempts: 3});
  });

  it("contains provider-reference collisions as UNKNOWN without a duplicate retry", async () => {
    const {repository, bindingId, conversationId, schedule} = await readyDelivery();
    await new PostgresConversationMessageRepository(pool).appendForConversation(conversationId, Message.create({
      id: "second-message", senderType: "AI_AGENT", channel: "WEBSITE", sourceLocale: "tr", body: "Second safe text", createdAt: currentTime,
    }));
    await schedule.execute({messageId: "second-message", bindingId});
    const adapter = new FakeConversationChannelOutboundAdapter();
    expect(await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).toMatchObject({delivered: 1, unknown: 1, retried: 0});
    expect((await pool.query("select status from conversation_channel_deliveries order by status")).rows.map(({status}) => status)).toEqual(["DELIVERED", "UNKNOWN"]);
    expect(await repository.claimDue({limit: 10, now: currentTime, leaseMilliseconds: 60_000})).toEqual([]);
  });

  it("lets another worker expire a slow batch without sending its later items or accepting late success", async () => {
    const {repository, bindingId, conversationId, schedule} = await readyDelivery();
    await new PostgresConversationMessageRepository(pool).appendForConversation(conversationId, Message.create({
      id: "second-message", senderType: "AI_AGENT", channel: "WEBSITE", sourceLocale: "tr", body: "Second safe text", createdAt: currentTime,
    }));
    await schedule.execute({messageId: "second-message", bindingId});
    let sends = 0;
    const adapter = {sendText: async () => {
      sends += 1;
      currentTime = new Date(currentTime.getTime() + 60_000);
      expect(await new PostgresConversationChannelRepository(pool, leases).claimDue({limit: 10, now: currentTime, leaseMilliseconds: 60_000})).toEqual([]);
      return {status: "DELIVERED" as const, providerMessageReference: "late-success"};
    }};
    expect(await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).toMatchObject({claimed: 2, delivered: 0, stale: 2});
    expect(sends).toBe(1);
    expect((await pool.query("select status from conversation_channel_deliveries")).rows.map(({status}) => status)).toEqual(["UNKNOWN", "UNKNOWN"]);
  });

  it("rechecks a safe-prefix barrier introduced after batch claiming", async () => {
    const {conversationId} = await seed();
    const repository = new PostgresConversationChannelRepository(pool, leases);
    const binding = await new CreateConversationChannelBinding(repository, ids, clock).execute({conversationId, ...identity});
    if (binding.status !== "created") throw new Error("Binding setup failed.");
    const messages = new PostgresConversationMessageRepository(pool);
    const schedule = new ScheduleConversationChannelDelivery(repository, ids, clock);
    for (const id of ["earlier-unknown", "first-safe", "second-safe"]) {
      await messages.appendForConversation(conversationId, Message.create({id, senderType: "INTERNAL_USER", channel: "WEBSITE", sourceLocale: id === "earlier-unknown" ? null : "tr", body: id, createdAt: currentTime}));
      // The current writer defaults Staff language; historical unknown rows need
      // explicit fixture metadata to reproduce later language confirmation.
      if (id === "earlier-unknown") await pool.query("update conversation_message_languages set source_locale=null where message_id=$1", [id]);
      if (id !== "earlier-unknown") expect(await schedule.execute({messageId: id, bindingId: binding.bindingId})).toMatchObject({status: "scheduled"});
    }
    let sends = 0;
    const adapter = {sendText: async () => {
      sends += 1;
      await pool.query("update conversation_message_languages set source_locale='fa',customer_target_locale='tr' where message_id='earlier-unknown'");
      return {status: "DELIVERED" as const, providerMessageReference: "first-confirmed"};
    }};
    expect(await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).toMatchObject({claimed: 2, delivered: 1, stale: 1});
    expect(sends).toBe(1);
  });

  it("does not let a non-plain-text Conversation body poison unrelated delivery claims", async () => {
    const {repository, conversationId, bindingId, schedule} = await readyDelivery("<b>Literal markup in Conversation</b>");
    await new PostgresConversationMessageRepository(pool).appendForConversation(conversationId, Message.create({
      id: "safe-after-markup", senderType: "INTERNAL_USER", channel: "WEBSITE", sourceLocale: "tr", body: "Safe text", createdAt: currentTime,
    }));
    await schedule.execute({messageId: "safe-after-markup", bindingId});
    const adapter = new FakeConversationChannelOutboundAdapter();
    await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute();
    expect(adapter.requests.map(({text}) => text)).toEqual(["Safe text"]);
    expect((await pool.query("select status,failure_category from conversation_channel_deliveries where message_id='ready-message'")).rows[0])
      .toEqual({status: "FAILED", failure_category: "INVALID_REQUEST"});
  });

  it.each(["bad ref", "https://example.invalid/id", "<b>", "x\u0001", "\u00a0", "x".repeat(161)])("rejects unsafe external references in SQL %#", async (value) => {
    const {bindingId, deliveryId, conversationId} = await readyDelivery();
    for (const column of ["external_account_reference", "external_conversation_reference", "external_participant_reference"]) {
      await expect(pool.query(`update conversation_channel_bindings set ${column}=$1 where id=$2`, [value, bindingId])).rejects.toMatchObject({code: value.length > 160 ? "22001" : "23514"});
    }
    await expect(pool.query(`insert into conversation_channel_inbound_messages
      (id,binding_id,conversation_id,external_message_reference,body,occurred_at,received_at) values ('bad-inbound',$1,$2,$3,'Hello',$4,$4)`, [bindingId, conversationId, value, currentTime])).rejects.toBeDefined();
    await expect(pool.query(`update conversation_channel_deliveries set status='DELIVERED',attempts=1,provider_message_reference=$1,delivered_at=$2,terminal_at=$2 where id=$3`, [value, currentTime, deliveryId])).rejects.toBeDefined();
  });

  it("rejects impossible delivery states and unsafe inbound SQL text", async () => {
    const {deliveryId, bindingId, conversationId} = await readyDelivery();
    for (const change of ["status='UNKNOWN',attempts=1,terminal_at=created_at,failure_category=null", "attempts=3", "status='RUNNING',lease_token='lease',leased_until=created_at", "failure_category='UNKNOWN_OUTCOME'"]) {
      await expect(pool.query(`update conversation_channel_deliveries set ${change} where id=$1`, [deliveryId])).rejects.toMatchObject({code: "23514"});
    }
    for (const body of [" ", "<script>bad</script>", "x\u0001", "x".repeat(10_001)]) {
      await expect(pool.query(`insert into conversation_channel_inbound_messages
        (id,binding_id,conversation_id,external_message_reference,body,occurred_at,received_at) values ('bad-body',$1,$2,'ref',$3,$4,$4)`, [bindingId, conversationId, body, currentTime])).rejects.toMatchObject({code: "23514"});
    }
  });

  it("rejects cross-conversation binding, delivery, and inbound correlation foreign keys", async () => {
    const {conversationId, bindingId, schedule, deliveryId} = await readyDelivery();
    const other = await seed("other");
    await new PostgresConversationMessageRepository(pool).appendForConversation(other.conversationId, Message.create({id: "other-message", senderType: "INTERNAL_USER", channel: "WEBSITE", sourceLocale: "tr", body: "Other", createdAt: currentTime}));
    expect(await schedule.execute({messageId: "other-message", bindingId})).toEqual({status: "binding_mismatch"});
    await expect(pool.query("update conversation_channel_deliveries set message_id='other-message' where id=$1", [deliveryId])).rejects.toMatchObject({code: "23503"});
    await expect(pool.query("update conversation_channel_deliveries set conversation_id=$1 where id=$2", [other.conversationId, deliveryId])).rejects.toMatchObject({code: "23503"});
    await expect(pool.query(`insert into conversation_channel_inbound_messages
      (id,binding_id,conversation_id,external_message_reference,body,occurred_at,received_at,correlated_message_id,correlated_at)
      values ('wrong-correlation',$1,$2,'ref','Hello',$3,$3,'other-message',$3)`, [bindingId, conversationId, currentTime])).rejects.toMatchObject({code: "23503"});
    await expect(pool.query(`insert into conversation_channel_inbound_messages
      (id,binding_id,conversation_id,external_message_reference,body,occurred_at,received_at)
      values ('wrong-binding',$1,$2,'ref','Hello',$3,$3)`, [bindingId, other.conversationId, currentTime])).rejects.toMatchObject({code: "23503"});
  });

  it.each(["PENDING", "FAILED", "CANCELLED", "MISSING", "UNKNOWN", "SKIPPED"])("rechecks %s translation safety at claim time", async (state) => {
    const {repository, bindingId, schedule} = await readyDelivery();
    if (state === "SKIPPED") await pool.query("update conversation_message_languages set delivery_state='SKIPPED' where message_id='ready-message'");
    else if (state === "UNKNOWN") await pool.query("update conversation_message_languages set source_locale=null where message_id='ready-message'");
    else {
      await pool.query("update conversation_message_languages set source_locale='fa' where message_id='ready-message'");
      if (state !== "MISSING") await pool.query(`insert into conversation_message_translations
        (id,message_id,source_locale,target_locale,status,body,created_at,updated_at) values ('translation','ready-message','fa','tr',$1,null,$2,$2)`, [state, currentTime]);
    }
    expect(await schedule.execute({messageId: "ready-message", bindingId})).toEqual({status: state === "SKIPPED" ? "not_customer_visible" : "translation_not_ready"});
    const adapter = new FakeConversationChannelOutboundAdapter();
    expect(await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).toMatchObject({claimed: 0});
    expect(adapter.requests).toEqual([]);
  });

  it("protects external conversations from cross-conversation binding and deduplicates inbound messages", async () => {
    const first = await seed("one");
    const second = await seed("two");
    const repository = new PostgresConversationChannelRepository(pool, leases);
    const bind = new CreateConversationChannelBinding(repository, ids, clock);
    expect(await bind.execute({conversationId: first.conversationId, ...identity})).toMatchObject({status: "created"});
    expect(await bind.execute({conversationId: first.conversationId, ...identity})).toMatchObject({status: "duplicate"});
    expect(await bind.execute({conversationId: second.conversationId, ...identity})).toEqual({status: "conflict"});

    const inbound = new RecordInboundChannelText(repository, repository, ids, clock);
    const event = {...identity, externalMessageReference: "provider-message-1", body: "Customer plain text", occurredAt: currentTime};
    const recorded = await inbound.execute(event);
    expect(recorded).toMatchObject({status: "recorded", conversationId: first.conversationId, correlatedMessageId: null});
    if (recorded.status !== "recorded") throw new Error("Inbound setup failed.");
    expect(await inbound.execute(event)).toMatchObject({status: "duplicate", inboundMessageId: recorded.inboundMessageId});
    expect(await inbound.execute({...event, body: "Altered replay"})).toEqual({status: "conflict"});
    expect(await inbound.execute({...event, externalConversationReference: "unknown-chat"})).toEqual({status: "unresolved_binding"});
    expect((await pool.query("select count(*)::int as count from conversation_channel_inbound_messages")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int as count from conversation_messages")).rows[0].count).toBe(0);
  });

  it("will not schedule untranslated or safe-prefix-blocked Staff text and deduplicates logical delivery", async () => {
    const {conversationId} = await seed();
    const repository = new PostgresConversationChannelRepository(pool, leases);
    const createdBinding = await new CreateConversationChannelBinding(repository, ids, clock).execute({conversationId, ...identity});
    if (createdBinding.status !== "created") throw new Error("Binding setup failed.");
    const messages = new PostgresConversationMessageRepository(pool);
    await messages.appendForConversation(conversationId, Message.create({
      id: "staff-pending", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member",
      sourceLocale: "fa", body: "Staff original must stay private", createdAt: new Date(currentTime.getTime() + 1),
    }));
    await messages.appendForConversation(conversationId, Message.create({
      id: "staff-later", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member",
      sourceLocale: "tr", body: "Later safe original", createdAt: new Date(currentTime.getTime() + 2),
    }));
    const schedule = new ScheduleConversationChannelDelivery(repository, ids, clock);
    expect(await schedule.execute({messageId: "staff-pending", bindingId: createdBinding.bindingId})).toEqual({status: "translation_not_ready"});
    expect(await schedule.execute({messageId: "staff-later", bindingId: createdBinding.bindingId})).toEqual({status: "translation_not_ready"});
    expect(JSON.stringify(await repository.claimDue({limit: 10, now: currentTime, leaseMilliseconds: 60_000}))).not.toContain("Staff original");

    const translation = new PostgresTranslationJobRepository(pool);
    const job = await translation.claim(new Date(currentTime.getTime() + 10));
    expect(job?.messageId).toBe("staff-pending");
    expect(await translation.finish(job!, {body: "Customer-safe Turkish text"}, new Date(currentTime.getTime() + 20))).toBe(true);
    expect(await schedule.execute({messageId: "staff-pending", bindingId: createdBinding.bindingId})).toMatchObject({status: "scheduled"});
    const duplicate = await schedule.execute({messageId: "staff-pending", bindingId: createdBinding.bindingId});
    expect(duplicate).toMatchObject({status: "duplicate"});
    expect((await pool.query("select count(*)::int as count from conversation_channel_deliveries")).rows[0].count).toBe(1);
    const adapter = new FakeConversationChannelOutboundAdapter();
    expect(await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).toMatchObject({delivered: 1});
    expect(adapter.requests.map(({text}) => text)).toEqual(["Customer-safe Turkish text"]);
    expect((await pool.query("select body from conversation_messages where id='staff-pending'")).rows[0].body).toBe("Staff original must stay private");
  });

  it("claims once, sends only projected text, retries bounded failures, and fences stale leases", async () => {
    const {conversationId} = await seed();
    const repository = new PostgresConversationChannelRepository(pool, leases);
    const binding = await new CreateConversationChannelBinding(repository, ids, clock).execute({conversationId, ...identity});
    if (binding.status !== "created") throw new Error("Binding setup failed.");
    await new PostgresConversationMessageRepository(pool).appendForConversation(conversationId, Message.create({
      id: "staff-safe", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member",
      sourceLocale: "tr", body: "Safe same-language text", createdAt: new Date(currentTime.getTime() + 1),
    }));
    expect(await new ScheduleConversationChannelDelivery(repository, ids, clock).execute({messageId: "staff-safe", bindingId: binding.bindingId})).toMatchObject({status: "scheduled"});
    const simultaneous = await Promise.all([
      repository.claimDue({limit: 10, now: currentTime, leaseMilliseconds: 60_000}),
      repository.claimDue({limit: 10, now: currentTime, leaseMilliseconds: 60_000}),
    ]);
    expect(simultaneous.flat()).toHaveLength(1);
    const first = simultaneous.flat()[0]!;
    expect(first.body).toBe("Safe same-language text");
    expect(await repository.markRetryable({job: first, category: "RATE_LIMITED", now: currentTime, availableAt: new Date(currentTime.getTime() + 1_000)})).toBe("rescheduled");

    currentTime = new Date(currentTime.getTime() + 1_000);
    const adapter = new FakeConversationChannelOutboundAdapter();
    expect(await new ProcessConversationChannelDeliveries(repository, adapter, clock).execute()).toMatchObject({claimed: 1, delivered: 1});
    expect(adapter.requests[0]).toMatchObject({text: "Safe same-language text", idempotencyReference: "channel-id-2"});
    expect((await pool.query("select status,attempts,provider_message_reference from conversation_channel_deliveries")).rows[0])
      .toEqual({status: "DELIVERED", attempts: 2, provider_message_reference: "provider-message-1"});
    expect(await repository.markUnknown({job: first, now: currentTime})).toBe(false);
  });

  it("terminalizes an expired running lease as UNKNOWN instead of retrying an ambiguous send", async () => {
    const {conversationId} = await seed();
    const repository = new PostgresConversationChannelRepository(pool, leases);
    const binding = await new CreateConversationChannelBinding(repository, ids, clock).execute({conversationId, ...identity});
    if (binding.status !== "created") throw new Error("Binding setup failed.");
    await new PostgresConversationMessageRepository(pool).appendForConversation(conversationId, Message.create({
      id: "staff-safe", senderType: "AI_AGENT", channel: "WEBSITE", sourceLocale: "tr", body: "Safe AI text",
      createdAt: new Date(currentTime.getTime() + 1),
    }));
    await new ScheduleConversationChannelDelivery(repository, ids, clock).execute({messageId: "staff-safe", bindingId: binding.bindingId});
    expect(await repository.claimDue({limit: 1, now: currentTime, leaseMilliseconds: 10_000})).toHaveLength(1);
    currentTime = new Date(currentTime.getTime() + 10_001);
    expect(await repository.claimDue({limit: 1, now: currentTime, leaseMilliseconds: 10_000})).toHaveLength(0);
    expect((await pool.query("select status,failure_category from conversation_channel_deliveries")).rows[0])
      .toEqual({status: "UNKNOWN", failure_category: "UNKNOWN_OUTCOME"});
  });
});
