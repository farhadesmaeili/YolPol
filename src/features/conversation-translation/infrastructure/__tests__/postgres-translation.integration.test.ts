import {readFile} from "node:fs/promises";
import {PostgresTranslationRemediationRepository} from "@/features/conversation-translation/infrastructure/persistence/postgres-translation-remediation-repository";
import {PostgresConversationTranslationControlRepository} from "@/features/conversation-translation/infrastructure/persistence/postgres-translation-control-repository";
import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";
import {Conversation} from "@/features/inquiries/domain/entities/conversation";
import {Message} from "@/features/inquiries/domain/entities/message";
import {PostgresInquiryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-repository";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {PostgresTranslationJobRepository} from "@/features/conversation-translation/infrastructure/persistence/postgres-translation-job-repository";
import {PostgresCustomerMessageReader} from "@/features/conversation-translation/infrastructure/persistence/postgres-customer-message-reader";
import {GetConversationMessageHistory} from "@/features/inquiries/application/use-cases/get-conversation-message-history";
import {ReadNewConversationMessages} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {toConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";
import {ProcessTranslationJobs} from "@/features/conversation-translation/application/use-cases/process-translation-jobs";
import {translationResponse} from "@/features/conversation-translation/testing/fakes/translation-fakes";
import type {Locale} from "@/shared/types/locale";
import {StreamConversationUpdates} from "@/features/inquiries/application/use-cases/stream-conversation-updates";
import {InMemoryConversationUpdateStreamRegistry} from "@/features/inquiries/infrastructure/streaming/in-memory-conversation-update-stream-registry";
import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";

let pool: Pool;
const now = new Date("2026-09-05T10:00:00.000Z");
const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);
async function clean() {
  await pool.query("truncate table conversation_channel_deliveries, conversation_channel_inbound_messages, conversation_channel_bindings, global_translation_setting_events, global_translation_settings, conversation_translation_control_events, conversation_translation_controls, conversation_translation_events, conversation_translation_jobs, conversation_message_translations, conversation_message_languages, conversation_ai_control_events, conversation_ai_controls, conversation_ai_response_jobs, ai_schedule_windows, ai_policy_events, ai_operation_policy, telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, conversation_access, conversation_messages, inquiry_assignments, inquiry_workflow_events, conversations, inquiry_outbox, inquiry_items, inquiry_team_members, inquiries");
}
async function seed(locale: Locale = "tr", initialMessage = false) {
  const inquiry = new InquiryTestBuilder().with({id: "translation-inquiry", source: {locale, path: `/${locale}/inquiry`}, createdAt: now}).buildNew();
  const conversation = Conversation.start({id: "translation-conversation", inquiryId: inquiry.id.value, channel: "WEBSITE", createdAt: now});
  if (initialMessage) conversation.addMessage({id: "initial-customer", senderType: "CUSTOMER", channel: "WEBSITE", body: "Initial customer", createdAt: now});
  await new PostgresInquiryRepository(pool).save(inquiry, undefined, conversation);
}
function messages() { return new PostgresConversationMessageRepository(pool); }
function reply(id: string, sourceLocale?: Locale, channel: "WEBSITE" | "TELEGRAM" = "WEBSITE") {
  return Message.create({id, senderType: "INTERNAL_USER", channel, actorReference: "staff:member", body: "Staff original", sourceLocale, createdAt: at(1)});
}
beforeAll(async () => { pool = new Pool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL)); await migrate(drizzle(pool), {migrationsFolder: resolve("drizzle")}); });
beforeEach(clean);
afterAll(async () => { if (pool) { await clean(); await pool.end(); } });

describe("durable Conversation translation", () => {
  it("retains unknown-language replies in the resume frontier until explicit language confirmation", async () => {
    await seed("tr");
    await pool.query(`insert into conversation_messages (id,conversation_id,position,sender_type,channel,body,created_at)
      values ('unknown-repair','translation-conversation',0,'AI_AGENT','WEBSITE','Trusted Turkish original',$1)`, [now]);
    await pool.query("insert into conversation_message_languages (message_id,source_locale,customer_target_locale) values ('unknown-repair',null,'tr')");
    await messages().appendForInquiry("translation-inquiry", Message.create({id: "later-safe", senderType: "AI_AGENT", channel: "WEBSITE",
      sourceLocale: "tr", body: "Later safe AI", createdAt: at(1)}));
    const reader = new PostgresCustomerMessageReader(pool);
    expect(await reader.findAfterPositionForInquiry("translation-inquiry", -1, 100))
      .toMatchObject([{position: 1, resumePosition: -1}]);
    const remediation = new PostgresTranslationRemediationRepository(pool);
    expect(await remediation.remediate({inquiryId: "translation-inquiry", messageId: "unknown-repair", action: "CONFIRM_LANGUAGE",
      sourceLocale: "tr", expectedVersion: 1, actorReference: "staff:member"})).toBe("updated");
    expect((await reader.findAfterPositionForInquiry("translation-inquiry", -1, 100))?.map(({position}) => position)).toEqual([0, 1]);
  });

  it("linearizes competing version-zero field updates and atomically records the winning before/after snapshot", async () => {
    await seed();
    const controls = new PostgresConversationTranslationControlRepository(pool);
    const base = {inquiryId: "translation-inquiry", customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "AUTO",
      expectedVersion: 0, actorReference: "staff:first", eventId: "first-control", now} as const;
    const attempts = [{...base, customerToStaffMode: "MANUAL" as const},
      {...base, aiToStaffMode: "ON_DEMAND" as const, actorReference: "staff:second", eventId: "second-control"}];
    const results = await Promise.all(attempts.map((input) => controls.change(input)));
    expect([...results].sort()).toEqual(["conflict", "updated"]);
    const winner = attempts[results.indexOf("updated")]!;
    expect(await controls.read(base.inquiryId)).toEqual({customerToStaffMode: winner.customerToStaffMode,
      staffToCustomerMode: winner.staffToCustomerMode, aiToStaffMode: winner.aiToStaffMode, version: 1});
    expect((await pool.query("select * from conversation_translation_control_events")).rows).toMatchObject([{
      id: winner.eventId, previous_customer_to_staff_mode: "AUTO", new_customer_to_staff_mode: winner.customerToStaffMode,
      previous_staff_to_customer_mode: "AUTO", new_staff_to_customer_mode: "AUTO",
      previous_ai_to_staff_mode: "ON_DEMAND", new_ai_to_staff_mode: winner.aiToStaffMode,
      previous_version: 0, new_version: 1, actor_reference: winner.actorReference,
    }]);
    expect(await controls.change(winner)).toBe("conflict");
    expect(await controls.change({...winner, expectedVersion: 1})).toBe("unchanged");
    expect((await pool.query("select count(*)::int as count from conversation_translation_controls")).rows[0].count).toBe(1);
    expect((await pool.query("select count(*)::int as count from conversation_translation_control_events")).rows[0].count).toBe(1);
    await expect(controls.change({...base, expectedVersion: 1, customerToStaffMode: "MANUAL", staffToCustomerMode: "MANUAL",
      eventId: winner.eventId})).rejects.toMatchObject({code: "23505"});
    expect((await controls.read(base.inquiryId))?.version).toBe(1);
    await pool.query("delete from inquiries where id=$1", [base.inquiryId]);
    expect((await pool.query("select count(*)::int as count from conversation_translation_control_events")).rows[0].count).toBe(0);
  });

  it.each([
    ["ON_DEMAND", "AUTO", "AUTO", 1, "staff:member"],
    ["AUTO", "ON_DEMAND", "AUTO", 1, "staff:member"],
    ["AUTO", "AUTO", "MANUAL", 1, "staff:member"],
    ["AUTO", "AUTO", "AUTO", 0, "staff:member"],
    ["AUTO", "AUTO", "AUTO", 1, "customer:forged"],
  ])("rejects invalid direct-SQL control values %s/%s/%s/%s/%s", async (customer, staff, ai, version, actor) => {
    await seed();
    await expect(pool.query(`insert into conversation_translation_controls
      (conversation_id,customer_to_staff_mode,staff_to_customer_mode,ai_to_staff_mode,version,updated_at,updated_by)
      values ('translation-conversation',$1,$2,$3,$4,$5,$6)`, [customer, staff, ai, version, now, actor])).rejects.toMatchObject({code: "23514"});
  });

  it("creates no AI convenience intent or Gateway execution from repeated Staff/Customer reads in ON_DEMAND", async () => {
    await seed();
    const controls = new PostgresConversationTranslationControlRepository(pool);
    await controls.change({inquiryId: "translation-inquiry", customerToStaffMode: "MANUAL", staffToCustomerMode: "MANUAL",
      aiToStaffMode: "ON_DEMAND", expectedVersion: 0, actorReference: "staff:member", eventId: "no-tokens", now});
    for (let index = 0; index < 3; index += 1) await messages().appendForInquiry("translation-inquiry", Message.create({
      id: `on-demand-${index}`, senderType: "AI_AGENT", channel: "WEBSITE", sourceLocale: "tr", body: "AI Turkish original", createdAt: at(index),
    }));
    for (let index = 0; index < 3; index += 1) {
      await controls.read("translation-inquiry");
      await messages().findPositionedForInquiry("translation-inquiry");
      expect(await new PostgresCustomerMessageReader(pool).findForInquiry("translation-inquiry")).toHaveLength(3);
    }
    const gateway = {execute: vi.fn().mockResolvedValue(translationResponse("Persian convenience translation"))};
    const worker = new ProcessTranslationJobs(new PostgresTranslationJobRepository(pool), gateway,
      {read: () => ({active: false, state: "INACTIVE"})}, {now: () => new Date("2099-01-01T00:00:00Z")});
    expect(await worker.execute()).toMatchObject({claimed: 0});
    expect(gateway.execute).not.toHaveBeenCalled();
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs")).rows[0].count).toBe(0);
    const remediation = new PostgresTranslationRemediationRepository(pool);
    const request = {inquiryId: "translation-inquiry", messageId: "on-demand-0", action: "REQUEST", expectedVersion: 1, actorReference: "staff:member"} as const;
    expect((await Promise.all([remediation.remediate(request), remediation.remediate(request)])).sort()).toEqual(["unchanged", "updated"]);
    expect(await worker.execute()).toMatchObject({claimed: 1, succeeded: 1});
    expect(await remediation.remediate(request)).toBe("unchanged");
    expect(await worker.execute()).toMatchObject({claimed: 0});
    expect(gateway.execute).toHaveBeenCalledTimes(1);
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs")).rows[0].count).toBe(1);
  });

  it.each(["CUSTOMER", "INTERNAL_USER", "AI_AGENT"] as const)("reuses the automatic %s intent during concurrent append and REQUEST", async (senderType) => {
    await seed();
    if (senderType === "AI_AGENT") await new PostgresConversationTranslationControlRepository(pool).change({
      inquiryId: "translation-inquiry", customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "AUTO",
      expectedVersion: 0, actorReference: "staff:member", eventId: "automatic-ai-override", now,
    });
    const message = senderType === "INTERNAL_USER" ? reply("auto-request") : Message.create({id: "auto-request", senderType,
      channel: "WEBSITE", sourceLocale: "tr", body: "Turkish original", createdAt: at(1)});
    const remediation = new PostgresTranslationRemediationRepository(pool);
    const request = {inquiryId: "translation-inquiry", messageId: message.id.value, action: "REQUEST", expectedVersion: 1, actorReference: "staff:member"} as const;
    const [appended, requested] = await Promise.all([messages().appendForInquiry(request.inquiryId, message), remediation.remediate(request)]);
    expect(appended).toBe("created");
    expect(["not_found", "unchanged"]).toContain(requested);
    expect(await remediation.remediate(request)).toBe("unchanged");
    expect((await pool.query("select target_locale from conversation_translation_jobs where message_id=$1", [message.id.value])).rows)
      .toEqual([{target_locale: senderType === "INTERNAL_USER" ? "tr" : "fa"}]);
  });
  it("rolls back the authoritative message if translation scheduling cannot commit", async () => {
    await seed();
    await pool.query("alter table conversation_translation_jobs add constraint test_reject_jobs check (false)");
    try {
      await expect(messages().appendForInquiry("translation-inquiry", reply("rollback"))).rejects.toThrow();
      expect((await pool.query("select count(*)::int as count from conversation_messages")).rows[0].count).toBe(0);
      expect((await pool.query("select count(*)::int as count from conversation_message_languages")).rows[0].count).toBe(0);
      expect((await pool.query("select count(*)::int as count from conversation_message_translations")).rows[0].count).toBe(0);
    } finally { await pool.query("alter table conversation_translation_jobs drop constraint test_reject_jobs"); }
  });
  it("delivers a completed translation through the existing stream after a pending poll without timing sleeps", async () => {
    await seed(); await messages().appendForInquiry("translation-inquiry", reply("stream"));
    const controller = new AbortController(); const received: {cursor: number; message: ConversationMessageDto}[] = [];
    const jobs = new PostgresTranslationJobRepository(pool); let polls = 0; let unavailable = false;
    const streamer = new StreamConversationUpdates(new ReadNewConversationMessages(new PostgresCustomerMessageReader(pool), toConversationMessageDto),
      new InMemoryConversationUpdateStreamRegistry<ConversationMessageDto>(), {wait: async () => {
        polls += 1;
        if (polls === 1) { expect(received).toEqual([]); const job = await jobs.claim(at(2)); await jobs.finish(job!, {body: "Stream translation"}, at(3)); }
        else controller.abort();
      }});
    const opened = streamer.open({conversationId: "translation-conversation", inquiryId: "translation-inquiry", afterCursor: -1, signal: controller.signal,
      onUpdate: (update) => received.push(update), onUnavailable: () => { unavailable = true; }});
    expect(opened.status).toBe("opened"); if (opened.status !== "opened") throw new Error("Stream unavailable");
    await opened.session.completed;
    expect(unavailable).toBe(false); expect(received).toMatchObject([{cursor: 0, message: {id: "stream", body: "Stream translation"}}]);
  });
  it.each(["tr", "ar", "fa"] as const)("atomically schedules initial and subsequent %s Customer messages", async (locale) => {
    await seed(locale, true);
    await messages().appendCustomerWebsiteForInquiry("translation-inquiry", Message.create({id: "customer-2", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: locale, body: "Customer original", createdAt: at(1)}));
    const languages = await pool.query("select source_locale from conversation_message_languages order by message_id");
    expect(languages.rows).toEqual([{source_locale: locale}, {source_locale: locale}]);
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs")).rows[0].count).toBe(locale === "fa" ? 0 : 2);
  });
  it("reproduces Turkish Customer to Persian Staff live delivery across history and SSE", async () => {
    await seed("tr");
    await pool.query(`insert into conversation_messages
      (id,conversation_id,position,sender_type,channel,body,created_at)
      values ('historical-unknown','translation-conversation',0,'INTERNAL_USER','WEBSITE','Historical Staff original',$1)`, [now]);
    await pool.query(`insert into conversation_message_languages
      (message_id,source_locale,customer_target_locale) values ('historical-unknown',null,'tr')`);

    await messages().appendCustomerWebsiteForInquiry("translation-inquiry", Message.create({
      id: "turkish-customer", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "tr",
      body: "Turkish Customer original", createdAt: at(1),
    }));
    const jobs = new PostgresTranslationJobRepository(pool);
    const inbound = (await jobs.claim(at(2)))!;
    expect(inbound).toMatchObject({messageId: "turkish-customer", sourceLocale: "tr", targetLocale: "fa"});
    expect(await jobs.finish(inbound, {body: "Persian Staff-facing translation"}, at(3))).toBe(true);
    expect((await messages().findPositionedForInquiry("translation-inquiry"))?.[1]).toMatchObject({
      position: 1,
      translation: {translations: [{targetLocale: "fa", status: "SUCCEEDED", body: "Persian Staff-facing translation"}]},
    });

    await messages().appendForInquiry("translation-inquiry", reply("persian-staff"));
    const outbound = (await jobs.claim(at(4)))!;
    expect(outbound).toMatchObject({messageId: "persian-staff", sourceLocale: "fa", targetLocale: "tr"});
    const reader = new PostgresCustomerMessageReader(pool);
    const history = new GetConversationMessageHistory(reader);
    expect(await history.execute({inquiryId: "translation-inquiry"})).toMatchObject({
      messages: [{id: "turkish-customer", position: 1, body: "Turkish Customer original"}],
    });

    const controller = new AbortController();
    const received: {cursor: number; message: ConversationMessageDto}[] = [];
    let polls = 0;
    const streamer = new StreamConversationUpdates(
      new ReadNewConversationMessages(reader, toConversationMessageDto),
      new InMemoryConversationUpdateStreamRegistry<ConversationMessageDto>(),
      {wait: async () => {
        polls += 1;
        if (polls === 1) expect(await jobs.finish(outbound, {body: "Turkish Customer-facing translation"}, at(5))).toBe(true);
        else controller.abort();
      }},
    );
    const opened = streamer.open({
      conversationId: "translation-conversation", inquiryId: "translation-inquiry", afterCursor: -1,
      signal: controller.signal, onUpdate: (update) => received.push(update), onUnavailable: () => { throw new Error("Stream unavailable"); },
    });
    expect(opened.status).toBe("opened");
    if (opened.status !== "opened") throw new Error("Stream unavailable");
    await opened.session.completed;
    expect(received.map(({cursor, message}) => ({cursor, id: message.id, body: message.body}))).toEqual([
      {cursor: 1, id: "turkish-customer", body: "Turkish Customer original"},
      {cursor: 2, id: "persian-staff", body: "Turkish Customer-facing translation"},
    ]);
    expect(await history.execute({inquiryId: "translation-inquiry"})).toMatchObject({messages: [
      {id: "turkish-customer", position: 1, body: "Turkish Customer original"},
      {id: "persian-staff", position: 2, body: "Turkish Customer-facing translation"},
    ]});
    expect(JSON.stringify(received)).not.toContain("Staff original");
  });
  it("captures latest Customer locale for future replies without retargeting history", async () => {
    await seed("tr");
    await messages().appendForInquiry("translation-inquiry", reply("staff-tr"));
    await messages().appendCustomerWebsiteForInquiry("translation-inquiry", Message.create({id: "customer-ar", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "ar", body: "Arabic customer", createdAt: at(2)}));
    await messages().appendForInquiry("translation-inquiry", reply("staff-ar"));
    expect((await pool.query("select message_id,customer_target_locale from conversation_message_languages where customer_target_locale is not null order by message_id")).rows).toEqual([{message_id: "staff-ar", customer_target_locale: "ar"}, {message_id: "staff-tr", customer_target_locale: "tr"}]);
  });
  it("withholds pending/failed Staff rows without hiding later Customer-safe history and SSE", async () => {
    await seed("tr"); await messages().appendForInquiry("translation-inquiry", reply("staff-1"));
    const reader = new PostgresCustomerMessageReader(pool);
    const history = new GetConversationMessageHistory(reader); const updates = new ReadNewConversationMessages(reader, toConversationMessageDto);
    expect(await history.execute({inquiryId: "translation-inquiry"})).toMatchObject({messages: []});
    expect(await updates.execute({inquiryId: "translation-inquiry", afterCursor: -1})).toMatchObject({updates: []});
    const jobs = new PostgresTranslationJobRepository(pool); const job = await jobs.claim(at(2)); expect(job).not.toBeNull();
    expect(await jobs.finish(job!, {body: "Turkish translated text"}, at(3))).toBe(true);
    expect(await jobs.finish(job!, {body: "Duplicate replacement"}, at(4))).toBe(false);
    expect(await updates.execute({inquiryId: "translation-inquiry", afterCursor: -1})).toMatchObject({updates: [{cursor: 0, message: {id: "staff-1", body: "Turkish translated text"}}]});
    expect(await updates.execute({inquiryId: "translation-inquiry", afterCursor: 0})).toMatchObject({updates: []});
    expect((await messages().findForInquiry("translation-inquiry"))?.[0]?.body).toBe("Staff original");
    await messages().appendForInquiry("translation-inquiry", reply("staff-failure"));
    const failedJob = await jobs.claim(at(5)); await jobs.finish(failedJob!, {failure: "PERMISSION"}, at(6));
    await messages().appendCustomerWebsiteForInquiry("translation-inquiry", Message.create({id: "later-customer", senderType: "CUSTOMER", channel: "WEBSITE", body: "Later customer", createdAt: at(7)}));
    expect(await updates.execute({inquiryId: "translation-inquiry", afterCursor: 0})).toMatchObject({
      updates: [{cursor: 2, resumeCursor: 0, message: {id: "later-customer", body: "Later customer"}}],
    });
    const safeHistory = JSON.stringify(await history.execute({inquiryId: "translation-inquiry"}));
    expect(safeHistory).toContain("Later customer");
    expect(safeHistory).not.toContain("Staff original"); expect(safeHistory).not.toContain("PERMISSION");
    expect((await messages().findPositionedForInquiry("translation-inquiry"))?.[1]?.translation?.translations[0]?.status).toBe("FAILED");
  });
  it("uses same-language originals and schedules Staff translation for AI_AGENT", async () => {
    await seed("tr");
    await new PostgresConversationTranslationControlRepository(pool).change({inquiryId: "translation-inquiry", customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "AUTO", expectedVersion: 0, actorReference: "staff:member", eventId: "automatic-ai", now});
    await messages().appendForInquiry("translation-inquiry", reply("same", "tr"));
    await messages().appendForInquiry("translation-inquiry", Message.create({id: "ai", senderType: "AI_AGENT", channel: "WEBSITE", body: "AI Turkish original", sourceLocale: "tr", createdAt: at(2)}));
    expect((await new PostgresCustomerMessageReader(pool).findForInquiry("translation-inquiry"))?.map((m) => m.body)).toEqual(["Staff original", "AI Turkish original"]);
    expect((await pool.query("select target_locale from conversation_message_translations order by message_id")).rows).toEqual([{target_locale: "fa"}]);
  });
  it("delivers a same-language AI reply beyond a failed cross-language Staff row", async () => {
    await seed("ar");
    await messages().appendForInquiry("translation-inquiry", reply("failed-staff", "fa"));
    const jobs = new PostgresTranslationJobRepository(pool);
    const failed = await jobs.claim(at(2));
    expect(failed).toMatchObject({messageId: "failed-staff", targetLocale: "ar"});
    await jobs.finish(failed!, {failure: "PERMISSION"}, at(3));
    await messages().appendForInquiry("translation-inquiry", Message.create({
      id: "safe-ai", senderType: "AI_AGENT", channel: "WEBSITE", sourceLocale: "ar",
      body: "Grounded Arabic response", createdAt: at(4),
    }));

    const reader = new PostgresCustomerMessageReader(pool);
    expect((await reader.findPositionedForInquiry("translation-inquiry"))?.map(({position, resumePosition, message}) => ({
      position, resumePosition, id: message.id.value, body: message.body,
    }))).toEqual([{position: 1, resumePosition: -1, id: "safe-ai", body: "Grounded Arabic response"}]);
    expect(await new ReadNewConversationMessages(reader, toConversationMessageDto)
      .execute({inquiryId: "translation-inquiry", afterCursor: -1})).toMatchObject({
      updates: [{cursor: 1, resumeCursor: -1, message: {id: "safe-ai", body: "Grounded Arabic response"}}],
    });
    expect(JSON.stringify(await reader.findForInquiry("translation-inquiry"))).not.toContain("Staff original");
  });
  it("delivers fa Customer and fa Staff originals without provider translation in history and SSE", async () => {
    await seed("fa");
    await messages().appendCustomerWebsiteForInquiry("translation-inquiry", Message.create({
      id: "fa-customer", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "fa",
      body: "Persian Customer original", createdAt: at(1),
    }));
    await messages().appendForInquiry("translation-inquiry", reply("fa-staff", "fa"));
    const reader = new PostgresCustomerMessageReader(pool);
    const history = await new GetConversationMessageHistory(reader).execute({inquiryId: "translation-inquiry"});
    const updates = await new ReadNewConversationMessages(reader, toConversationMessageDto).execute({inquiryId: "translation-inquiry", afterCursor: -1});
    expect(history).toMatchObject({messages: [
      {id: "fa-customer", position: 0, body: "Persian Customer original"},
      {id: "fa-staff", position: 1, body: "Staff original"},
    ]});
    expect(updates).toMatchObject({updates: [
      {cursor: 0, message: {id: "fa-customer", body: "Persian Customer original"}},
      {cursor: 1, message: {id: "fa-staff", body: "Staff original"}},
    ]});
    expect((await pool.query("select count(*)::int as count from conversation_message_translations")).rows[0].count).toBe(0);
  });
  it("deduplicates scheduling and prevents concurrent claims and stale finalization", async () => {
    await seed(); const message = reply("one"); await messages().appendForInquiry("translation-inquiry", message);
    expect(await messages().appendForInquiry("translation-inquiry", message)).toBe("duplicate");
    const left = new PostgresTranslationJobRepository(pool); const right = new PostgresTranslationJobRepository(pool);
    const claims = await Promise.all([left.claim(at(2)), right.claim(at(2))]);
    expect(claims.filter(Boolean)).toHaveLength(1); const first = claims.find(Boolean)!;
    const recovered = await right.claim(at(63)); expect(recovered?.executionId).toBe(first.executionId);
    expect(recovered?.leaseToken).not.toBe(first.leaseToken);
    expect(await left.finish(first, {body: "Stale text"}, at(64))).toBe(false);
    expect(await right.finish(recovered!, {body: "Translated text"}, at(64))).toBe(true);
    expect((await pool.query("select count(*)::int as count from conversation_message_translations")).rows[0].count).toBe(1);
  });
  it("excludes overlapping provider execution after expiry and bounds crash recovery", async () => {
    await seed(); await messages().appendForInquiry("translation-inquiry", reply("one"));
    const jobs = new PostgresTranslationJobRepository(pool); const first = (await jobs.claim(at(2)))!;
    await jobs.withExecutionLock(first, at(3), async () => {
      const recovered = (await jobs.claim(at(63)))!;
      expect(await jobs.withExecutionLock(recovered, at(64), async () => { throw new Error("Must not execute"); })).toBe(false);
      expect(await jobs.finish(first, {body: "Stale"}, at(64))).toBe(false);
    });
    expect(await jobs.claim(at(124))).not.toBeNull();
    expect(await jobs.claim(at(185))).toBeNull();
    expect((await pool.query("select status,failure_category,attempts from conversation_translation_jobs")).rows[0]).toEqual({status: "FAILED", failure_category: "WORKER_RECOVERY_EXHAUSTED", attempts: 3});
  });
  it("limits execution to remaining lease time and withholds execution near expiry", async () => {
    await seed(); await messages().appendForInquiry("translation-inquiry", reply("budget"));
    const jobs = new PostgresTranslationJobRepository(pool); const job = (await jobs.claim(at(2)))!;
    let budget = 0;
    expect(await jobs.withExecutionLock(job, at(30), async (_source, remaining) => { budget = remaining; })).toBe(true);
    expect(budget).toBeGreaterThan(0); expect(budget).toBeLessThanOrEqual(27_000);
    expect(await jobs.withExecutionLock(job, at(60), async () => { throw new Error("Must not execute near expiry"); })).toBe(false);
    expect(await jobs.finish(job, {body: "Expired result"}, at(63))).toBe(false);
  });
  it.each(["PAUSED", "HUMAN_TAKEOVER"])("translates actual Staff messages under %s and keeps Telegram/routing semantics", async (state) => {
    await seed();
    await pool.query("insert into conversation_ai_controls (conversation_id,state,version,updated_at,updated_by) values ('translation-conversation',$1,1,$2,'staff:member')", [state, now]);
    await messages().appendForConversation("translation-conversation", reply("telegram-staff", undefined, "TELEGRAM"));
    const worker = new ProcessTranslationJobs(new PostgresTranslationJobRepository(pool), {execute: async () => translationResponse("Translated reply")}, {read: () => ({active: false, state: "INACTIVE"})}, {now: () => at(2)});
    expect(await worker.execute()).toMatchObject({succeeded: 1});
    expect((await pool.query("select state from conversation_ai_controls")).rows[0].state).toBe(state);
    expect((await new PostgresCustomerMessageReader(pool).findForInquiry("translation-inquiry"))?.[0]?.body).toBe("Translated reply");
  });
});

const remediationInput = {inquiryId: "translation-inquiry", messageId: "blocked", actorReference: "staff:member", expectedVersion: 1};
const later = (seconds: number) => new Date(new Date("2099-01-01T00:00:00Z").getTime() + seconds * 1000);
async function deliveryFixture() {
  await seed("tr");
  await pool.query("insert into conversation_messages (id,conversation_id,position,sender_type,channel,body,created_at) values ('first','translation-conversation',10,'CUSTOMER','WEBSITE','First customer',$1)", [now]);
  await messages().appendForInquiry("translation-inquiry", reply("blocked"));
  await pool.query("insert into conversation_messages (id,conversation_id,position,sender_type,channel,body,created_at) values ('later','translation-conversation',12,'CUSTOMER','WEBSITE','Later customer',$1)", [at(2)]);
  await messages().appendForInquiry("translation-inquiry", reply("last"));
  const jobs = new PostgresTranslationJobRepository(pool);
  const first = (await jobs.claim(later(0)))!;
  expect(first.messageId).toBe("blocked");
  await jobs.finish(first, {failure: "PERMISSION"}, later(1));
  const last = (await jobs.claim(later(2)))!;
  await jobs.finish(last, {body: "Last translated reply"}, later(3));
  return {jobs, first, repository: new PostgresTranslationRemediationRepository(pool)};
}
async function visiblePositions() {
  const reader = new PostgresCustomerMessageReader(pool);
  const history = await new GetConversationMessageHistory(reader).execute({inquiryId: "translation-inquiry"});
  const updates = await new ReadNewConversationMessages(reader, toConversationMessageDto).execute({inquiryId: "translation-inquiry", afterCursor: -1});
  if (history.status !== "found" || updates.status !== "found") throw new Error("Projection failed");
  expect(history.messages.map((m) => m.position)).toEqual(updates.updates.map((u) => u.cursor));
  expect(history.messages.map(({body}) => body)).toEqual(updates.updates.map(({message}) => message.body));
  return {positions: history.messages.map((m) => m.position), bodies: history.messages.map((m) => m.body)};
}
describe("explicit translation remediation", () => {
  it("limits Staff SSE translation lookups to the fetched batch and avoids translation queries on idle polls", async () => {
    await seed();
    await messages().appendForInquiry("translation-inquiry", reply("older"));
    await messages().appendForInquiry("translation-inquiry", reply("newer"));
    const query = vi.spyOn(pool, "query");
    try {
      const batch = await messages().findAfterPositionForInquiry("translation-inquiry", 0, 1);
      expect(batch).toHaveLength(1);
      expect(batch?.[0]).toMatchObject({position: 1, translation: {translations: [{targetLocale: "tr", status: "PENDING"}]}});
      expect(query).toHaveBeenCalledTimes(3);
      const translationQuery = JSON.stringify(query.mock.calls.at(-1));
      expect(translationQuery).toContain("l.message_id in"); expect(translationQuery).toContain("newer"); expect(translationQuery).not.toContain("older");
      query.mockClear();
      expect(await messages().findAfterPositionForInquiry("translation-inquiry", 1, 100)).toEqual([]);
      expect(query).toHaveBeenCalledTimes(2);
    } finally { query.mockRestore(); }
  });
  it("bounds history and SSE body reads without per-message queries", async () => {
    await seed();
    await pool.query(`insert into conversation_messages (id,conversation_id,position,sender_type,channel,body,created_at)
      select 'bulk_'||n,'translation-conversation',n,'CUSTOMER','WEBSITE','Safe customer',$1 from generate_series(0,1010) n`, [now]);
    const reader = new PostgresCustomerMessageReader(pool);
    const query = vi.spyOn(pool, "query");
    try {
      expect(await reader.findPositionedForInquiry("translation-inquiry")).toHaveLength(1000);
      expect(query).toHaveBeenCalledTimes(2);
      query.mockClear();
      const replay = await reader.findAfterPositionForInquiry("translation-inquiry", 999, 1000);
      expect(replay?.map((row) => row.position)).toEqual(Array.from({length: 11}, (_, i) => i + 1000));
      expect(query).toHaveBeenCalledTimes(2);
      query.mockClear();
      expect(await reader.findAfterPositionForInquiry("translation-inquiry", -1, 1000)).toHaveLength(100);
      expect(query).toHaveBeenCalledTimes(2);
    } finally { query.mockRestore(); }
  });
  it.each(["AUTO", "PAUSED", "HUMAN_TAKEOVER"])("keeps %s, grace times and cancelled/superseded fallback jobs unchanged", async (state) => {
    const {repository} = await deliveryFixture();
    await pool.query("insert into conversation_ai_controls (conversation_id,state,version,updated_at,updated_by) values ('translation-conversation',$1,1,$2,'staff:member')", [state, now]);
    for (const [status, trigger, position] of [["CANCELLED", "first", 10], ["SUPERSEDED", "later", 12]] as const) {
      await pool.query(`insert into conversation_ai_response_jobs
        (id,conversation_id,trigger_message_id,trigger_message_position,status,not_before,execution_id,created_at,updated_at,terminal_at)
        values ($1,'translation-conversation',$2,$3,$4,$5,$6,$7,$7,$7)`, [`ai_job_${status}`, trigger, position, status, at(60), `fallback_${status}`, now]);
    }
    const before = await pool.query("select * from conversation_ai_response_jobs order by id");
    const control = await pool.query("select * from conversation_ai_controls");
    await messages().appendForInquiry("translation-inquiry", Message.create({id: "unknown", senderType: "AI_AGENT", channel: "WEBSITE", body: "Unknown original", createdAt: at(4)}));
    expect(await repository.remediate({...remediationInput, action: "RETRY", targetLocale: "tr"})).toBe("updated");
    expect(await repository.remediate({...remediationInput, expectedVersion: 2, action: "SKIP"})).toBe("updated");
    expect(await repository.remediate({...remediationInput, messageId: "unknown", action: "CONFIRM_LANGUAGE", sourceLocale: "fa"})).toBe("updated");
    expect((await pool.query("select * from conversation_ai_response_jobs order by id")).rows).toEqual(before.rows);
    expect((await pool.query("select * from conversation_ai_controls")).rows).toEqual(control.rows);
  });
  it("skips failed position 11 permanently and removes its reconnect frontier", async () => {
    const {repository, jobs, first} = await deliveryFixture();
    expect((await visiblePositions()).positions).toEqual([10, 12, 13]);
    expect((await new PostgresCustomerMessageReader(pool).findPositionedForInquiry("translation-inquiry"))
      ?.map(({position, resumePosition}) => ({position, resumePosition}))).toEqual([
      {position: 10, resumePosition: undefined},
      {position: 12, resumePosition: 10},
      {position: 13, resumePosition: 10},
    ]);
    expect(await repository.remediate({...remediationInput, action: "SKIP"})).toBe("updated");
    expect((await visiblePositions()).positions).toEqual([10, 12, 13]);
    expect((await new PostgresCustomerMessageReader(pool).findPositionedForInquiry("translation-inquiry"))
      ?.map(({resumePosition}) => resumePosition)).toEqual([undefined, undefined, undefined]);
    expect((await visiblePositions()).bodies).not.toContain("Staff original");
    expect(await repository.remediate({...remediationInput, expectedVersion: 2, action: "RETRY", targetLocale: "tr"})).toBe("conflict");
    expect(await jobs.finish(first, {body: "Late original leak"}, later(5))).toBe(false);
    const updates = new ReadNewConversationMessages(new PostgresCustomerMessageReader(pool), toConversationMessageDto);
    expect(await updates.execute({inquiryId: "translation-inquiry", afterCursor: 13})).toMatchObject({updates: []});
    expect((await messages().findForInquiry("translation-inquiry"))?.find((m) => m.id.value === "blocked")?.body).toBe("Staff original");
    await expect(pool.query("update conversation_message_languages set delivery_state='ACTIVE' where message_id='blocked'")).rejects.toMatchObject({code: "55000"});
  });
  it("retries the same logical translation with a fresh execution, requires another click after failure and releases success at 11", async () => {
    const {repository, jobs, first} = await deliveryFixture();
    expect(await repository.remediate({...remediationInput, action: "RETRY", targetLocale: "tr"})).toBe("updated");
    expect(await repository.remediate({...remediationInput, action: "RETRY", targetLocale: "tr"})).toBe("conflict");
    expect((await visiblePositions()).positions).toEqual([10, 12, 13]);
    const retry = (await jobs.claim(later(5)))!;
    expect(retry.id).toBe(first.id); expect(retry.executionId).not.toBe(first.executionId);
    expect(await jobs.finish(first, {body: "Stale"}, later(6))).toBe(false);
    await jobs.finish(retry, {failure: "PERMISSION"}, later(6));
    expect(await jobs.claim(later(7))).toBeNull(); expect((await visiblePositions()).positions).toEqual([10, 12, 13]);
    expect(await repository.remediate({...remediationInput, expectedVersion: 2, action: "RETRY", targetLocale: "tr"})).toBe("updated");
    const next = (await jobs.claim(later(8)))!; expect(next.executionId).not.toBe(retry.executionId);
    await jobs.finish(next, {body: "Recovered translation"}, later(9));
    expect((await visiblePositions()).positions).toEqual([10, 11, 12, 13]);
    expect((await visiblePositions()).bodies).toEqual(["First customer", "Recovered translation", "Later customer", "Last translated reply"]);
    expect((await pool.query("select count(*)::int as count from conversation_message_translations where message_id='blocked'")).rows[0].count).toBe(1);
    expect(await repository.remediate({...remediationInput, expectedVersion: 3, action: "SKIP"})).toBe("conflict");
  });
  it.each(["RETRY", "SKIP"] as const)("gives provider CANCELLED explicit %s remediation", async (action) => {
    await seed(); await messages().appendForInquiry("translation-inquiry", reply("blocked"));
    const jobs = new PostgresTranslationJobRepository(pool); const job = (await jobs.claim(later(0)))!;
    await jobs.finish(job, {failure: "EMERGENCY_DISABLED"}, later(1));
    expect((await visiblePositions()).positions).toEqual([]);
    const repository = new PostgresTranslationRemediationRepository(pool);
    expect(await repository.remediate({...remediationInput, ...(action === "RETRY" ? {action, targetLocale: "tr" as const} : {action})})).toBe("updated");
    if (action === "RETRY") {
      const next = (await jobs.claim(later(2)))!; await jobs.finish(next, {body: "Recovered"}, later(3));
      expect((await visiblePositions()).positions).toEqual([0]);
    } else expect(await jobs.claim(later(2))).toBeNull();
  });
  it("fences running jobs when skipped and prevents resurrection after crash recovery", async () => {
    await seed(); await messages().appendForInquiry("translation-inquiry", reply("blocked"));
    const jobs = new PostgresTranslationJobRepository(pool); const job = (await jobs.claim(later(0)))!;
    await jobs.withExecutionLock(job, later(1), async () => {
      expect(await new PostgresTranslationRemediationRepository(pool).remediate({...remediationInput, action: "SKIP"})).toBe("updated");
      expect(await jobs.finish(job, {body: "Too late"}, later(2))).toBe(false);
    });
    expect(await jobs.claim(later(120))).toBeNull();
  });
  it("records content-free immutable audits, rejects cross-inquiry requests, and cascades retention", async () => {
    const {repository} = await deliveryFixture();
    expect(await repository.remediate({...remediationInput, inquiryId: "other", action: "SKIP"})).toBe("not_found");
    const results = await Promise.all([repository.remediate({...remediationInput, action: "SKIP"}), repository.remediate({...remediationInput, action: "SKIP"})]);
    expect(results.sort()).toEqual(["conflict", "updated"]);
    const events = (await pool.query("select * from conversation_translation_events")).rows;
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({message_id: "blocked", action: "SKIP", actor_reference: "staff:member", previous_state: "ACTIVE", new_state: "SKIPPED", previous_version: 1, new_version: 2});
    expect(JSON.stringify(events)).not.toContain("Staff original");
    await expect(pool.query("update conversation_translation_events set actor_reference='staff:other'")).rejects.toMatchObject({code: "55000"});
    await expect(pool.query("delete from conversation_translation_events")).rejects.toMatchObject({code: "55000"});
    await pool.query("delete from inquiries where id='translation-inquiry'");
    expect((await pool.query("select count(*)::int as count from conversation_translation_events")).rows[0].count).toBe(0);
  });
  it("inherits current global defaults, preserves explicit overrides, and returns to globals after removal", async () => {
    await seed();
    const controls = new PostgresConversationTranslationControlRepository(pool);
    const fallback = {customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND", version: 0} as const;
    expect(await controls.readGlobalDefaults()).toEqual(fallback);
    expect(await controls.readEffective("translation-inquiry")).toEqual({globalDefaults: fallback, override: null,
      effective: {customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND"}, source: "GLOBAL"});
    const globalBase = {customerToStaffMode: "MANUAL" as const, staffToCustomerMode: "AUTO" as const, aiToStaffMode: "AUTO" as const,
      expectedVersion: 0, actorReference: "staff:admin", eventId: "global-1", now};
    expect(await controls.changeGlobalDefaults(globalBase)).toBe("updated");
    expect((await controls.readEffective("translation-inquiry"))?.effective).toEqual({customerToStaffMode: "MANUAL", staffToCustomerMode: "AUTO", aiToStaffMode: "AUTO"});
    const override = {customerToStaffMode: "AUTO" as const, staffToCustomerMode: "MANUAL" as const, aiToStaffMode: "ON_DEMAND" as const};
    expect(await controls.changeOverride({inquiryId: "translation-inquiry", action: "SET", policy: override, expectedVersion: 0,
      actorReference: "staff:member", eventId: "override-1", now: at(1)})).toBe("updated");
    expect((await controls.readEffective("translation-inquiry"))?.effective).toEqual(override);
    expect(await controls.changeGlobalDefaults({...globalBase, customerToStaffMode: "AUTO", staffToCustomerMode: "MANUAL", expectedVersion: 1, eventId: "global-2", now: at(2)})).toBe("updated");
    expect((await controls.readEffective("translation-inquiry"))?.effective).toEqual(override);
    expect(await controls.changeOverride({inquiryId: "translation-inquiry", action: "REMOVE", expectedVersion: 1,
      actorReference: "staff:member", eventId: "override-remove", now: at(3)})).toBe("updated");
    expect(await controls.readEffective("translation-inquiry")).toMatchObject({source: "GLOBAL", override: null,
      effective: {customerToStaffMode: "AUTO", staffToCustomerMode: "MANUAL", aiToStaffMode: "AUTO"}});
    expect((await pool.query("select operation from conversation_translation_control_events order by occurred_at")).rows).toEqual([{operation: "SET"}, {operation: "REMOVE"}]);
    await expect(pool.query("update global_translation_setting_events set actor_reference='staff:other'")).rejects.toMatchObject({code: "55000"});
  });

  it("serializes first global-default writes and rejects the stale contender", async () => {
    await seed();
    const controls = new PostgresConversationTranslationControlRepository(pool);
    const base = {customerToStaffMode: "MANUAL" as const, staffToCustomerMode: "AUTO" as const, aiToStaffMode: "ON_DEMAND" as const,
      expectedVersion: 0, actorReference: "staff:admin", now};
    const results = await Promise.all([
      controls.changeGlobalDefaults({...base, eventId: "global-race-1"}),
      controls.changeGlobalDefaults({...base, staffToCustomerMode: "MANUAL", eventId: "global-race-2"}),
    ]);
    expect(results.sort()).toEqual(["conflict", "updated"]);
    expect((await pool.query("select count(*)::int as count from global_translation_setting_events")).rows[0].count).toBe(1);
  });

  it("persists versioned directional controls, rejects stale updates, and keeps control audits append-only", async () => {
    await seed();
    const controls = new PostgresConversationTranslationControlRepository(pool);
    expect(await controls.read("translation-inquiry")).toEqual({
      customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND", version: 0,
    });
    const change = {
      inquiryId: "translation-inquiry", customerToStaffMode: "MANUAL" as const,
      staffToCustomerMode: "MANUAL" as const, aiToStaffMode: "ON_DEMAND" as const,
      expectedVersion: 0, actorReference: "staff:member", eventId: "translation_control_event_1", now,
    };
    expect(await controls.change(change)).toBe("updated");
    expect(await controls.read("translation-inquiry")).toEqual({
      customerToStaffMode: "MANUAL", staffToCustomerMode: "MANUAL", aiToStaffMode: "ON_DEMAND", version: 1,
    });
    expect(await controls.change({...change, customerToStaffMode: "AUTO", eventId: "translation_control_event_2"})).toBe("conflict");
    expect(await controls.change({...change, expectedVersion: 1, eventId: "translation_control_event_3"})).toBe("unchanged");
    const events = await pool.query("select * from conversation_translation_control_events");
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]).toMatchObject({previous_version: 0, new_version: 1, actor_reference: "staff:member"});
    await expect(pool.query("update conversation_translation_control_events set actor_reference='staff:other'")).rejects.toMatchObject({code: "55000"});
    await expect(pool.query("delete from conversation_translation_control_events")).rejects.toMatchObject({code: "55000"});
  });
  it("uses manual and on-demand scheduling without source leaks and reuses each translation intent", async () => {
    await seed("tr");
    const controls = new PostgresConversationTranslationControlRepository(pool);
    expect(await controls.change({
      inquiryId: "translation-inquiry", customerToStaffMode: "MANUAL", staffToCustomerMode: "MANUAL",
      aiToStaffMode: "ON_DEMAND", expectedVersion: 0, actorReference: "staff:member",
      eventId: "translation_control_manual", now,
    })).toBe("updated");
    await messages().appendCustomerWebsiteForInquiry("translation-inquiry", Message.create({
      id: "manual-customer", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "tr",
      body: "Customer Turkish original", createdAt: at(1),
    }));
    await messages().appendForInquiry("translation-inquiry", Message.create({
      id: "manual-ai", senderType: "AI_AGENT", channel: "WEBSITE", sourceLocale: "tr",
      body: "AI Turkish original", createdAt: at(2),
    }));
    await messages().appendForInquiry("translation-inquiry", reply("manual-staff"));
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs")).rows[0].count).toBe(0);
    expect((await new PostgresCustomerMessageReader(pool).findForInquiry("translation-inquiry"))?.map((message) => message.body))
      .toEqual(["Customer Turkish original", "AI Turkish original"]);
    expect(await new ReadNewConversationMessages(new PostgresCustomerMessageReader(pool), toConversationMessageDto)
      .execute({inquiryId: "translation-inquiry", afterCursor: 1})).toMatchObject({updates: []});

    const remediation = new PostgresTranslationRemediationRepository(pool);
    const manualRequest = (messageId: string, actorReference = "staff:member") => remediation.remediate({
      inquiryId: "translation-inquiry", messageId, action: "REQUEST", expectedVersion: 1, actorReference,
    });
    expect((await Promise.all([manualRequest("manual-customer"), manualRequest("manual-customer", "staff:other")])).sort()).toEqual(["unchanged", "updated"]);
    expect(await manualRequest("manual-ai")).toBe("updated");
    expect(await manualRequest("manual-staff")).toBe("updated");
    expect((await pool.query("select message_id,target_locale from conversation_translation_jobs order by message_id")).rows).toEqual([
      {message_id: "manual-ai", target_locale: "fa"},
      {message_id: "manual-customer", target_locale: "fa"},
      {message_id: "manual-staff", target_locale: "tr"},
    ]);
    const jobs = new PostgresTranslationJobRepository(pool);
    for (let index = 0; index < 3; index += 1) {
      const job = await jobs.claim(later(4 + index));
      expect(job).not.toBeNull();
      await jobs.finish(job!, {body: job!.messageId === "manual-staff" ? "Staff Turkish safe translation" : "Persian Staff convenience translation"}, later(8 + index));
    }
    expect(await manualRequest("manual-ai")).toBe("unchanged");
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs")).rows[0].count).toBe(3);
    expect((await new PostgresCustomerMessageReader(pool).findForInquiry("translation-inquiry"))?.map((message) => message.body))
      .toEqual(["Customer Turkish original", "AI Turkish original", "Staff Turkish safe translation"]);
    expect(await new ReadNewConversationMessages(new PostgresCustomerMessageReader(pool), toConversationMessageDto)
      .execute({inquiryId: "translation-inquiry", afterCursor: 1})).toMatchObject({updates: [{message: {id: "manual-staff", body: "Staff Turkish safe translation"}}]});
    expect((await messages().findForInquiry("translation-inquiry"))?.map((message) => message.body))
      .toEqual(["Customer Turkish original", "AI Turkish original", "Staff original"]);
  });
  it("keeps queued, claimed, and completed translation work reusable across mode changes", async () => {
    await seed("tr");
    const controls = new PostgresConversationTranslationControlRepository(pool);
    await messages().appendCustomerWebsiteForInquiry("translation-inquiry", Message.create({
      id: "queued-before-manual", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "tr", body: "Customer", createdAt: at(1),
    }));
    expect(await controls.change({
      inquiryId: "translation-inquiry", customerToStaffMode: "MANUAL", staffToCustomerMode: "AUTO", aiToStaffMode: "ON_DEMAND",
      expectedVersion: 0, actorReference: "staff:member", eventId: "translation_control_queued", now: at(2),
    })).toBe("updated");
    const jobs = new PostgresTranslationJobRepository(pool);
    const claimed = await jobs.claim(at(3));
    expect(claimed?.messageId).toBe("queued-before-manual");
    expect(await new PostgresTranslationRemediationRepository(pool).remediate({
      inquiryId: "translation-inquiry", messageId: "queued-before-manual", action: "REQUEST",
      expectedVersion: 1, actorReference: "staff:other",
    })).toBe("unchanged");
    expect(await controls.change({
      inquiryId: "translation-inquiry", customerToStaffMode: "AUTO", staffToCustomerMode: "AUTO", aiToStaffMode: "AUTO",
      expectedVersion: 1, actorReference: "staff:member", eventId: "translation_control_running", now: at(4),
    })).toBe("updated");
    expect(await jobs.finish(claimed!, {body: "Reusable Staff translation"}, at(5))).toBe(true);
    await messages().appendCustomerWebsiteForInquiry("translation-inquiry", Message.create({
      id: "automatic-after-resume", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "tr", body: "Later Customer", createdAt: at(6),
    }));
    expect((await pool.query("select status,body from conversation_message_translations where message_id='queued-before-manual'")).rows[0])
      .toEqual({status: "SUCCEEDED", body: "Reusable Staff translation"});
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs where message_id='automatic-after-resume'")).rows[0].count).toBe(1);
  });
  it("keeps same-language Staff originals Customer-safe in MANUAL without creating a provider job", async () => {
    await seed("fa");
    const controls = new PostgresConversationTranslationControlRepository(pool);
    await controls.change({
      inquiryId: "translation-inquiry", customerToStaffMode: "AUTO", staffToCustomerMode: "MANUAL", aiToStaffMode: "AUTO",
      expectedVersion: 0, actorReference: "staff:member", eventId: "translation_control_same", now,
    });
    await messages().appendForInquiry("translation-inquiry", reply("same-language", "fa"));
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs")).rows[0].count).toBe(0);
    expect((await new PostgresCustomerMessageReader(pool).findForInquiry("translation-inquiry"))?.map((message) => message.body)).toEqual(["Staff original"]);
  });
  it("keeps source-language confirmation separate from provider scheduling in MANUAL", async () => {
    await seed("tr");
    const controls = new PostgresConversationTranslationControlRepository(pool);
    await controls.change({
      inquiryId: "translation-inquiry", customerToStaffMode: "AUTO", staffToCustomerMode: "MANUAL", aiToStaffMode: "AUTO",
      expectedVersion: 0, actorReference: "staff:member", eventId: "translation_control_unknown", now,
    });
    await pool.query(`insert into conversation_messages
      (id,conversation_id,position,sender_type,channel,actor_reference,body,created_at)
      values ('unknown-manual','translation-conversation',0,'INTERNAL_USER','WEBSITE','staff:member','Unknown Staff source',$1)`, [now]);
    await pool.query("insert into conversation_message_languages (message_id,source_locale,customer_target_locale) values ('unknown-manual',null,'tr')");
    const remediation = new PostgresTranslationRemediationRepository(pool);
    expect(await remediation.remediate({
      inquiryId: "translation-inquiry", messageId: "unknown-manual", action: "CONFIRM_LANGUAGE",
      sourceLocale: "fa", expectedVersion: 1, actorReference: "staff:member",
    })).toBe("updated");
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs where message_id='unknown-manual'")).rows[0].count).toBe(0);
    expect((await pool.query("select source_locale,customer_target_locale from conversation_message_languages where message_id='unknown-manual'")).rows)
      .toEqual([{source_locale: "fa", customer_target_locale: "tr"}]);
    expect(await new PostgresCustomerMessageReader(pool).findForInquiry("translation-inquiry")).toEqual([]);
    expect(await remediation.remediate({
      inquiryId: "translation-inquiry", messageId: "unknown-manual", action: "REQUEST",
      expectedVersion: 2, actorReference: "staff:member",
    })).toBe("updated");
    expect((await pool.query("select target_locale from conversation_translation_jobs where message_id='unknown-manual'")).rows)
      .toEqual([{target_locale: "tr"}]);
  });
  it.each(["CUSTOMER", "INTERNAL_USER", "AI_AGENT"] as const)("linearizes %s append against a simultaneous mode change without duplicate jobs", async (senderType) => {
    await seed("tr");
    const controls = new PostgresConversationTranslationControlRepository(pool);
    const message = senderType === "INTERNAL_USER" ? reply("racing-message") : Message.create({
      id: "racing-message", senderType, channel: "WEBSITE", sourceLocale: "tr", body: "Turkish original", createdAt: at(1),
    });
    const [, changed] = await Promise.all([
      messages().appendForInquiry("translation-inquiry", message),
      controls.change({
        inquiryId: "translation-inquiry", customerToStaffMode: senderType === "CUSTOMER" ? "MANUAL" : "AUTO",
        staffToCustomerMode: senderType === "INTERNAL_USER" ? "MANUAL" : "AUTO",
        aiToStaffMode: senderType === "AI_AGENT" ? "ON_DEMAND" : "AUTO",
        expectedVersion: 0, actorReference: "staff:member", eventId: `translation_control_race_${senderType.toLowerCase()}`, now,
      }),
    ]);
    expect(changed).toBe("updated");
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs where message_id='racing-message'")).rows[0].count)
      .toBeLessThanOrEqual(1);
  });
  it.each(["CUSTOMER", "INTERNAL_USER", "AI_AGENT"] as const)("blocks %s append on the Conversation lock and observes committed manual policy", async (senderType) => {
    await seed();
    const lock = await pool.connect();
    let append: Promise<unknown> | undefined;
    try {
      await lock.query("begin");
      await lock.query("select id from conversations where id='translation-conversation' for update");
      const pid = (await lock.query<{pid: number}>("select pg_backend_pid() as pid")).rows[0]!.pid;
      await lock.query(`insert into conversation_translation_controls
        (conversation_id,customer_to_staff_mode,staff_to_customer_mode,ai_to_staff_mode,version,updated_at,updated_by)
        values ('translation-conversation','MANUAL','MANUAL','ON_DEMAND',1,$1,'staff:member')`, [now]);
      append = messages().appendForInquiry("translation-inquiry", senderType === "INTERNAL_USER" ? reply("locked-append")
        : Message.create({id: "locked-append", senderType, channel: "WEBSITE", sourceLocale: "tr", body: "Turkish original", createdAt: at(1)}));
      // Observe actual PostgreSQL lock contention before releasing the policy transaction.
      const deadline = Date.now() + 5_000;
      let blocked = false;
      while (!blocked && Date.now() < deadline) {
        blocked = (await pool.query<{blocked: boolean}>(`select exists(select 1 from pg_stat_activity
          where datname=current_database() and $1=any(pg_blocking_pids(pid))) as blocked`, [pid])).rows[0]!.blocked;
        if (!blocked) await new Promise((resolveWait) => setTimeout(resolveWait, 5));
      }
      expect(blocked).toBe(true);
      await lock.query("commit");
      expect(await append).toBe("created");
      expect((await pool.query("select count(*)::int as count from conversation_translation_jobs")).rows[0].count).toBe(0);
    } finally {
      await lock.query("rollback");
      lock.release();
      await append;
    }
  });
  it("applies actual 0018 over historical originals, backfills trusted locale and resolves unknown language explicitly", async () => {
    await seed("ar", true);
    await messages().appendForInquiry("translation-inquiry", reply("blocked"));
    await messages().appendForInquiry("translation-inquiry", Message.create({id: "historic-ai", senderType: "AI_AGENT", channel: "WEBSITE", body: "Unknown AI original", createdAt: at(2)}));
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("drop table conversation_translation_events,conversation_translation_jobs,conversation_message_translations,conversation_message_languages");
      await client.query("drop function prevent_translation_event_mutation(),prevent_translation_delivery_revival()");
      await client.query(await readFile(resolve("drizzle/0018_conversation_translation.sql"), "utf8"));
      await client.query("alter table conversation_translation_events drop constraint translation_event_action_check");
      await client.query("alter table conversation_translation_events add constraint translation_event_action_check check (action in ('REQUEST','RETRY','SKIP','CONFIRM_LANGUAGE'))");
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
    expect((await pool.query("select source_locale from conversation_message_languages where message_id='initial-customer'")).rows[0].source_locale).toBe("ar");
    expect((await pool.query("select source_locale,customer_target_locale from conversation_message_languages where message_id='blocked'")).rows[0]).toEqual({source_locale: null, customer_target_locale: "ar"});
    expect((await visiblePositions()).positions).toEqual([0]);
    const repository = new PostgresTranslationRemediationRepository(pool);
    expect(await repository.remediate({...remediationInput, action: "CONFIRM_LANGUAGE", sourceLocale: "fa"})).toBe("updated");
    expect((await visiblePositions()).positions).toEqual([0]);
    const jobs = new PostgresTranslationJobRepository(pool); const job = (await jobs.claim(later(0)))!;
    expect(job.targetLocale).toBe("ar"); await jobs.finish(job, {body: "Arabic translation"}, later(1));
    expect((await visiblePositions()).positions).toEqual([0, 1]);
    expect(await repository.remediate({...remediationInput, messageId: "historic-ai", action: "SKIP"})).toBe("updated");
    expect((await messages().findForInquiry("translation-inquiry"))?.map((m) => m.body)).toEqual(["Initial customer", "Staff original", "Unknown AI original"]);
    await messages().appendCustomerWebsiteForInquiry("translation-inquiry", Message.create({id: "current-customer", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "tr", body: "Current customer", createdAt: at(4)}));
    await messages().appendForInquiry("translation-inquiry", reply("future-reply"));
    expect((await pool.query("select customer_target_locale from conversation_message_languages where message_id='future-reply'")).rows[0].customer_target_locale).toBe("tr");
    expect((await visiblePositions()).positions).toEqual([0, 1, 3]);
    expect((await visiblePositions()).bodies).not.toContain("Unknown AI original");
  });
});
