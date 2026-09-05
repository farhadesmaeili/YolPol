import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";

import {PostgresConversationAiRoutingRepository} from "@/features/conversation-ai-routing/infrastructure/persistence/postgres/repositories/postgres-conversation-ai-routing-repository";
import type {AiOperationsPolicyEvent} from "@/features/ai-operations/application/ports/ai-operations-ports";
import {AiOperationsPolicy} from "@/features/ai-operations/domain/entities/ai-operations-policy";
import {PostgresAiOperationsPolicyRepository} from "@/features/ai-operations/infrastructure/persistence/postgres/repositories/postgres-ai-operations-policy-repository";
import {Message} from "@/features/inquiries/domain/entities/message";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";

let pool: Pool;
let leaseSequence = 0;
let globalAllowed = true;
const at = (seconds: number) => new Date(Date.parse("2026-09-02T10:00:00.000Z") + seconds * 1_000);

function repository() {
  return new PostgresConversationAiRoutingRepository(pool, {generate: () => `lease_${++leaseSequence}`}, {execute: async () => globalAllowed ? {allowed: true, reason: "ALLOWED_FALLBACK"} : {allowed: false, reason: "POLICY_DISABLED"}});
}

async function clean() {
  await pool.query("truncate table conversation_translation_events, conversation_translation_jobs, conversation_message_translations, conversation_message_languages, conversation_ai_control_events, conversation_ai_controls, conversation_ai_response_jobs, ai_schedule_windows, ai_policy_events, ai_operation_policy, telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, conversation_access, conversation_messages, inquiry_assignments, inquiry_workflow_events, conversations, inquiry_outbox, inquiry_items, inquiry_team_members, inquiries");
}

async function seed(jobId = "ai_job_turn_1") {
  await pool.query(`insert into inquiries (id,status,full_name,email,phone,preferred_contact_methods,country,source_locale,source_path,privacy_accepted,privacy_accepted_at,privacy_policy_version,created_at,updated_at)
    values ('inquiry-1','NEW','Customer','customer@example.com','+10000000000',array['email']::varchar[],'TR','en','/en/inquiry',true,$1,'v1',$1,$1)`, [at(0)]);
  await pool.query("insert into conversations (id,inquiry_id,channel,created_at) values ('conversation-1','inquiry-1','WEBSITE',$1)", [at(0)]);
  await pool.query("insert into conversation_messages (id,conversation_id,position,sender_type,channel,body,created_at) values ('customer-1','conversation-1',0,'CUSTOMER','WEBSITE','Customer question',$1)", [at(0)]);
  await pool.query("insert into conversation_ai_response_jobs (id,conversation_id,trigger_message_id,trigger_message_position,status,not_before,execution_id,attempts,created_at,updated_at,version) values ($1,'conversation-1','customer-1',0,'PENDING',$2,$3,0,$2,$2,1)", [jobId, at(0), `ai_fallback_${jobId}`]);
  await pool.query("insert into ai_operation_policy (id,mode,business_time_zone,human_grace_period_seconds,version,updated_at,updated_by) values ('global','FALLBACK','Asia/Tehran',60,1,$1,'staff:member-1')", [at(0)]);
}

function operationsPolicy(version: number, mode: "DISABLED" | "FALLBACK", updatedAt: Date) {
  return AiOperationsPolicy.create({mode, businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 60, scheduleWindows: [], version, updatedAt, updatedBy: "staff:member-1"});
}

function operationsEvent(id: string, previousPolicy: AiOperationsPolicy, newPolicy: AiOperationsPolicy): AiOperationsPolicyEvent {
  return {id, eventType: "POLICY_UPDATED", previousPolicy, newPolicy, actorReference: newPolicy.updatedBy, occurredAt: newPolicy.updatedAt};
}

beforeAll(async () => {
  pool = new Pool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: inquiryPostgresSchema}), {migrationsFolder: resolve("drizzle")});
});
beforeEach(async () => { await clean(); leaseSequence = 0; globalAllowed = true; await seed(); });
afterAll(async () => { if (pool) { await clean(); await pool.end(); } });

describe("PostgresConversationAiRoutingRepository", () => {
  it("uses SKIP LOCKED leases, recovers expiry, and rejects stale lease finalization", async () => {
    const first = repository();
    const second = repository();
    const [left, right] = await Promise.all([
      first.claimDue({limit: 1, now: at(1), leaseMilliseconds: 10_000}),
      second.claimDue({limit: 1, now: at(1), leaseMilliseconds: 10_000}),
    ]);
    expect(left.length + right.length).toBe(1);
    const stale = (left[0] ?? right[0])!;
    const recovered = await second.claimDue({limit: 1, now: at(12), leaseMilliseconds: 10_000});
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.attempts).toBe(2);
    await expect(first.finalize({job: stale, body: "Stale response", now: at(13)})).resolves.toBe("stale_lease");
    expect((await pool.query("select count(*)::int as count from conversation_messages where sender_type='AI_AGENT'")).rows[0].count).toBe(0);
  });

  it("lets a Staff reply win during generation and commits no generated text", async () => {
    const routing = repository();
    const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
    expect((await routing.prepare({job: job!, now: at(2), maximumAgeMilliseconds: 86_400_000})).status).toBe("eligible");
    const staff = Message.create({id: "staff-1", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member-1", body: "A human answer", createdAt: at(3)});
    await new PostgresConversationMessageRepository(pool).appendForInquiry("inquiry-1", staff);
    await expect(routing.finalize({job: job!, body: "Losing AI response", now: at(4)})).resolves.toBe("stale_lease");
    const rows = await pool.query("select sender_type, body from conversation_messages order by position");
    expect(rows.rows).toEqual([{sender_type: "CUSTOMER", body: "Customer question"}, {sender_type: "INTERNAL_USER", body: "A human answer"}]);
  });

  it("supersedes the old turn when a newer customer message commits first", async () => {
    const routing = repository();
    const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
    const customer = Message.create({id: "customer-2", senderType: "CUSTOMER", channel: "WEBSITE", body: "New question", createdAt: at(2)});
    await new PostgresConversationMessageRepository(pool).appendCustomerWebsiteForInquiry("inquiry-1", customer, {id: "ai_job_turn_2", triggerMessageId: "customer-2", notBefore: at(3), executionId: "ai_fallback_ai_job_turn_2", createdAt: at(2)});
    await expect(routing.finalize({job: job!, body: "Stale AI response", now: at(4)})).resolves.toBe("stale_lease");
    const jobs = await pool.query("select id,status from conversation_ai_response_jobs order by id");
    expect(jobs.rows).toEqual([{id: "ai_job_turn_1", status: "SUPERSEDED"}, {id: "ai_job_turn_2", status: "PENDING"}]);
  });

  it("commits AI exactly once before a later Staff reply and exposes it through normal positions", async () => {
    const routing = repository();
    const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
    await expect(routing.finalize({job: job!, body: "AI response", now: at(2)})).resolves.toBe("succeeded");
    const staff = Message.create({id: "staff-2", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member-1", body: "Follow-up", createdAt: at(3)});
    await new PostgresConversationMessageRepository(pool).appendForInquiry("inquiry-1", staff);
    expect((await pool.query("select position,sender_type from conversation_messages order by position")).rows).toEqual([
      {position: 0, sender_type: "CUSTOMER"}, {position: 1, sender_type: "AI_AGENT"}, {position: 2, sender_type: "INTERNAL_USER"},
    ]);
    expect((await pool.query("select count(*)::int as count from conversation_messages where sender_type='AI_AGENT'")).rows[0].count).toBe(1);
    const streamed = await new PostgresConversationMessageRepository(pool).findAfterPositionForInquiry("inquiry-1", 0, 10);
    expect(streamed?.map(({position, message}) => ({position, senderType: message.senderType, body: message.body}))).toEqual([
      {position: 1, senderType: "AI_AGENT", body: "AI response"}, {position: 2, senderType: "INTERNAL_USER", body: "Follow-up"},
    ]);
  });

  it("keeps pause and takeover auditable, versioned, and resume-only-for-future-turns", async () => {
    const routing = repository();
    expect(await routing.changeControl({inquiryId: "inquiry-1", state: "PAUSED", expectedVersion: 0, actorReference: "staff:member-1", eventId: "event-pause", now: at(1)})).toBe("updated");
    expect(await routing.changeControl({inquiryId: "inquiry-1", state: "HUMAN_TAKEOVER", expectedVersion: 0, actorReference: "staff:member-1", eventId: "event-stale", now: at(2)})).toBe("conflict");
    expect(await routing.changeControl({inquiryId: "inquiry-1", state: "AUTO", expectedVersion: 1, actorReference: "staff:member-1", eventId: "event-resume", now: at(3)})).toBe("updated");
    expect((await pool.query("select status from conversation_ai_response_jobs where id='ai_job_turn_1'")).rows[0].status).toBe("CANCELLED");
    const customer = Message.create({id: "customer-future", senderType: "CUSTOMER", channel: "WEBSITE", body: "Future turn", createdAt: at(4)});
    await new PostgresConversationMessageRepository(pool).appendCustomerWebsiteForInquiry("inquiry-1", customer, {id: "ai_job_future", triggerMessageId: "customer-future", notBefore: at(5), executionId: "ai_fallback_ai_job_future", createdAt: at(4)});
    expect((await pool.query("select id,status from conversation_ai_response_jobs order by created_at")).rows).toEqual([{id: "ai_job_turn_1", status: "CANCELLED"}, {id: "ai_job_future", status: "PENDING"}]);
    expect((await pool.query("select previous_state,new_state,previous_version,new_version,actor_reference from conversation_ai_control_events order by occurred_at")).rows).toEqual([
      {previous_state: "AUTO", new_state: "PAUSED", previous_version: 0, new_version: 1, actor_reference: "staff:member-1"},
      {previous_state: "PAUSED", new_state: "AUTO", previous_version: 1, new_version: 2, actor_reference: "staff:member-1"},
    ]);
    await expect(pool.query("update conversation_ai_control_events set actor_reference='staff:other' where id='event-pause'")).rejects.toMatchObject({code: "55000"});
    await expect(pool.query("delete from conversation_ai_control_events where id='event-pause'")).rejects.toMatchObject({code: "55000"});
    await expect(pool.query("delete from conversations where id='conversation-1'")).resolves.toMatchObject({rowCount: 1});
    expect((await pool.query("select count(*)::int as count from conversation_ai_control_events")).rows[0].count).toBe(0);
  });

  it("suppresses a generating job on takeover, pause, or final global disable", async () => {
    for (const [index, state] of ["PAUSED", "HUMAN_TAKEOVER"] .entries()) {
      if (index > 0) { await clean(); await seed(); }
      const routing = repository();
      const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
      await routing.changeControl({inquiryId: "inquiry-1", state: state as "PAUSED" | "HUMAN_TAKEOVER", expectedVersion: 0, actorReference: "staff:member-1", eventId: `event-${index}`, now: at(2)});
      await expect(routing.finalize({job: job!, body: "Suppressed", now: at(3)})).resolves.toBe("stale_lease");
    }
    await clean(); await seed();
    const routing = repository();
    const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
    globalAllowed = false;
    await expect(routing.finalize({job: job!, body: "Disabled", now: at(2)})).resolves.toBe("cancelled");
    expect((await pool.query("select count(*)::int as count from conversation_messages where sender_type='AI_AGENT'")).rows[0].count).toBe(0);
  });

  it("terminalizes active jobs when Operations is disabled so re-enabling cannot resurrect them", async () => {
    const operations = new PostgresAiOperationsPolicyRepository(pool);
    const enabled = operationsPolicy(1, "FALLBACK", at(0));
    const disabled = operationsPolicy(2, "DISABLED", at(1));
    expect(await operations.save(disabled, operationsEvent("aipe_disable-routing", enabled, disabled), 1)).toBe("saved");
    expect((await pool.query("select status from conversation_ai_response_jobs where id='ai_job_turn_1'")).rows[0].status).toBe("CANCELLED");
    const reenabled = operationsPolicy(3, "FALLBACK", at(2));
    expect(await operations.save(reenabled, operationsEvent("aipe_reenable-routing", disabled, reenabled), 2)).toBe("saved");
    expect((await pool.query("select status from conversation_ai_response_jobs where id='ai_job_turn_1'")).rows[0].status).toBe("CANCELLED");
  });

  it("serializes a concurrent customer job insertion with Operations disable", async () => {
    const operations = new PostgresAiOperationsPolicyRepository(pool);
    const enabled = operationsPolicy(1, "FALLBACK", at(0));
    const disabled = operationsPolicy(2, "DISABLED", at(2));
    const customer = Message.create({id: "customer-disable-race", senderType: "CUSTOMER", channel: "WEBSITE", body: "Concurrent question", createdAt: at(1)});
    await Promise.all([
      new PostgresConversationMessageRepository(pool).appendCustomerWebsiteForInquiry("inquiry-1", customer, {
        id: "ai_job_disable_race", triggerMessageId: customer.id.value, notBefore: at(61),
        executionId: "ai_fallback_ai_job_disable_race", createdAt: at(1),
      }),
      operations.save(disabled, operationsEvent("aipe_disable-race", enabled, disabled), 1),
    ]);
    expect((await pool.query("select count(*)::int as count from conversation_ai_response_jobs where status in ('PENDING','RUNNING')")).rows[0].count).toBe(0);
  });

  it("fails closed when the Operations policy disappears before customer persistence", async () => {
    await pool.query("delete from ai_operation_policy where id='global'");
    const customer = Message.create({id: "customer-missing-policy", senderType: "CUSTOMER", channel: "WEBSITE", body: "Question", createdAt: at(1)});
    await new PostgresConversationMessageRepository(pool).appendCustomerWebsiteForInquiry("inquiry-1", customer, {
      id: "ai_job_missing_policy", triggerMessageId: customer.id.value, notBefore: at(61),
      executionId: "ai_fallback_ai_job_missing_policy", createdAt: at(1),
    });
    expect((await pool.query("select id,status from conversation_ai_response_jobs order by id")).rows).toEqual([
      {id: "ai_job_turn_1", status: "SUPERSEDED"},
    ]);
  });
});
