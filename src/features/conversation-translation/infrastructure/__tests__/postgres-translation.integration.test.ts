import {readFile} from "node:fs/promises";
import {PostgresTranslationRemediationRepository} from "@/features/conversation-translation/infrastructure/persistence/postgres-translation-remediation-repository";
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
  await pool.query("truncate table conversation_translation_events, conversation_translation_jobs, conversation_message_translations, conversation_message_languages, conversation_ai_control_events, conversation_ai_controls, conversation_ai_response_jobs, ai_schedule_windows, ai_policy_events, ai_operation_policy, telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, conversation_access, conversation_messages, inquiry_assignments, inquiry_workflow_events, conversations, inquiry_outbox, inquiry_items, inquiry_team_members, inquiries");
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
  it("holds pending/failed history and SSE, releases success once at the original position, and keeps originals", async () => {
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
    expect(await updates.execute({inquiryId: "translation-inquiry", afterCursor: 0})).toMatchObject({updates: []});
    const safeHistory = JSON.stringify(await history.execute({inquiryId: "translation-inquiry"}));
    expect(safeHistory).not.toContain("Staff original"); expect(safeHistory).not.toContain("PERMISSION");
    expect((await messages().findPositionedForInquiry("translation-inquiry"))?.[1]?.translation?.translations[0]?.status).toBe("FAILED");
  });
  it("uses same-language originals and schedules Staff translation for AI_AGENT", async () => {
    await seed("tr"); await messages().appendForInquiry("translation-inquiry", reply("same", "tr"));
    await messages().appendForInquiry("translation-inquiry", Message.create({id: "ai", senderType: "AI_AGENT", channel: "WEBSITE", body: "AI Turkish original", sourceLocale: "tr", createdAt: at(2)}));
    expect((await new PostgresCustomerMessageReader(pool).findForInquiry("translation-inquiry"))?.map((m) => m.body)).toEqual(["Staff original", "AI Turkish original"]);
    expect((await pool.query("select target_locale from conversation_message_translations order by message_id")).rows).toEqual([{target_locale: "fa"}, {target_locale: "fa"}]);
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
  it("skips failed position 11 permanently, preserves originals, and releases 12/13 in history and SSE", async () => {
    const {repository, jobs, first} = await deliveryFixture();
    expect((await visiblePositions()).positions).toEqual([10]);
    expect(await repository.remediate({...remediationInput, action: "SKIP"})).toBe("updated");
    expect((await visiblePositions()).positions).toEqual([10, 12, 13]);
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
    expect((await visiblePositions()).positions).toEqual([10]);
    const retry = (await jobs.claim(later(5)))!;
    expect(retry.id).toBe(first.id); expect(retry.executionId).not.toBe(first.executionId);
    expect(await jobs.finish(first, {body: "Stale"}, later(6))).toBe(false);
    await jobs.finish(retry, {failure: "PERMISSION"}, later(6));
    expect(await jobs.claim(later(7))).toBeNull(); expect((await visiblePositions()).positions).toEqual([10]);
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
