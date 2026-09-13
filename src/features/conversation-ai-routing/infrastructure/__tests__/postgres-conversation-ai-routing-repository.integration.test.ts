import {resolve} from "node:path";
import {readFileSync} from "node:fs";
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
  await pool.query("truncate table conversation_channel_deliveries, conversation_channel_inbound_messages, conversation_channel_bindings, global_translation_setting_events, global_translation_settings, conversation_translation_control_events, conversation_translation_controls, conversation_translation_events, conversation_translation_jobs, conversation_message_translations, conversation_message_languages, conversation_ai_control_events, conversation_ai_controls, conversation_ai_response_jobs, ai_schedule_windows, ai_policy_events, ai_operation_policy, telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, conversation_access, conversation_messages, inquiry_assignments, inquiry_workflow_events, conversations, inquiry_outbox, inquiry_items, inquiry_team_members, inquiries");
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
  it("uses one initial human grace period, continues immediately, preserves burst superseding, and resets after Staff takeover", async () => {
    await pool.query("update conversation_ai_response_jobs set not_before=$1 where id='ai_job_turn_1'", [at(60)]);
    const routing = repository();
    const messages = new PostgresConversationMessageRepository(pool);

    await expect(routing.claimDue({limit: 10, now: at(59), leaseMilliseconds: 60_000})).resolves.toHaveLength(0);
    const [initialJob] = await routing.claimDue({limit: 10, now: at(60), leaseMilliseconds: 60_000});
    expect(initialJob?.id).toBe("ai_job_turn_1");
    await expect(routing.finalize({job: initialJob!, body: "Initial AI response", decision: "RESPOND", now: at(61)})).resolves.toBe("succeeded");
    await expect(routing.claimDue({limit: 10, now: at(61), leaseMilliseconds: 60_000})).resolves.toHaveLength(0);

    await messages.appendForInquiry("inquiry-1", Message.create({
      id: "system-after-ai", senderType: "SYSTEM", channel: "WEBSITE", body: "Internal event", createdAt: at(62),
    }));
    await pool.query(`insert into conversation_message_translations
      (id,message_id,source_locale,target_locale,status,body,created_at,updated_at,version)
      values ('translation-ai-response','ai_response_ai_job_turn_1','en','tr','SUCCEEDED','Translated AI response',$1,$1,1)`, [at(62)]);

    const firstFollowUp = Message.create({
      id: "customer-follow-up-1", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "en", body: "First follow-up", createdAt: at(63),
    });
    await messages.appendCustomerWebsiteForInquiry("inquiry-1", firstFollowUp, {
      id: "ai_job_follow_up_1", triggerMessageId: firstFollowUp.id.value, notBefore: at(123), continuationNotBefore: at(63),
      executionId: "ai_fallback_ai_job_follow_up_1", createdAt: at(63),
    });
    const secondFollowUp = Message.create({
      id: "customer-follow-up-2", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "en", body: "Second follow-up", createdAt: at(64),
    });
    await messages.appendCustomerWebsiteForInquiry("inquiry-1", secondFollowUp, {
      id: "ai_job_follow_up_2", triggerMessageId: secondFollowUp.id.value, notBefore: at(124), continuationNotBefore: at(64),
      executionId: "ai_fallback_ai_job_follow_up_2", createdAt: at(64),
    });
    expect((await pool.query("select id,status,not_before from conversation_ai_response_jobs where id like 'ai_job_follow_up_%' order by id")).rows).toEqual([
      {id: "ai_job_follow_up_1", status: "SUPERSEDED", not_before: at(63)},
      {id: "ai_job_follow_up_2", status: "PENDING", not_before: at(64)},
    ]);

    const [continuedJob] = await routing.claimDue({limit: 10, now: at(64), leaseMilliseconds: 60_000});
    expect(continuedJob?.id).toBe("ai_job_follow_up_2");
    await expect(routing.finalize({job: continuedJob!, body: "Continued AI response", decision: "RESPOND", now: at(65)})).resolves.toBe("succeeded");

    const thirdFollowUp = Message.create({
      id: "customer-follow-up-3", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "en", body: "Third follow-up", createdAt: at(66),
    });
    await messages.appendCustomerWebsiteForInquiry("inquiry-1", thirdFollowUp, {
      id: "ai_job_follow_up_3", triggerMessageId: thirdFollowUp.id.value, notBefore: at(126), continuationNotBefore: at(66),
      executionId: "ai_fallback_ai_job_follow_up_3", createdAt: at(66),
    });
    const [thirdJob] = await routing.claimDue({limit: 10, now: at(66), leaseMilliseconds: 60_000});
    expect(thirdJob?.id).toBe("ai_job_follow_up_3");
    await expect(routing.finalize({job: thirdJob!, body: "Another AI response", decision: "RESPOND", now: at(67)})).resolves.toBe("succeeded");

    await messages.appendForInquiry("inquiry-1", Message.create({
      id: "staff-takeover", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member-1", body: "Staff response", createdAt: at(68),
    }));
    await messages.appendForInquiry("inquiry-1", Message.create({
      id: "system-after-staff", senderType: "SYSTEM", channel: "WEBSITE", body: "Internal event", createdAt: at(69),
    }));
    const postTakeover = Message.create({
      id: "customer-after-staff", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "en", body: "Question after Staff", createdAt: at(70),
    });
    await messages.appendCustomerWebsiteForInquiry("inquiry-1", postTakeover, {
      id: "ai_job_after_staff", triggerMessageId: postTakeover.id.value, notBefore: at(130), continuationNotBefore: at(70),
      executionId: "ai_fallback_ai_job_after_staff", createdAt: at(70),
    });
    await expect(routing.claimDue({limit: 10, now: at(129), leaseMilliseconds: 60_000})).resolves.toHaveLength(0);
    const [reentryJob] = await routing.claimDue({limit: 10, now: at(130), leaseMilliseconds: 60_000});
    expect(reentryJob?.id).toBe("ai_job_after_staff");
  });

  it.each([
    ["FAILED", "INFRASTRUCTURE_FAILURE"],
    ["SUPERSEDED", null],
  ] as const)("does not activate continuation from a %s job even if a correlated AI-shaped message exists", async (status, failureCategory) => {
    await pool.query(`update conversation_ai_response_jobs set status=$1,failure_category=$2,terminal_at=$3,updated_at=$3 where id='ai_job_turn_1'`, [status, failureCategory, at(1)]);
    const messages = new PostgresConversationMessageRepository(pool);
    await messages.appendForInquiry("inquiry-1", Message.create({
      id: "ai_response_ai_job_turn_1", senderType: "AI_AGENT", channel: "WEBSITE", body: "Uncommitted AI-shaped message", createdAt: at(2),
    }));
    const customer = Message.create({
      id: `customer-after-${status.toLowerCase()}`, senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "en", body: "Follow-up", createdAt: at(3),
    });
    await messages.appendCustomerWebsiteForInquiry("inquiry-1", customer, {
      id: `ai_job_after_${status.toLowerCase()}`, triggerMessageId: customer.id.value, notBefore: at(63), continuationNotBefore: at(3),
      executionId: `ai_fallback_ai_job_after_${status.toLowerCase()}`, createdAt: at(3),
    });
    expect((await pool.query("select not_before from conversation_ai_response_jobs where trigger_message_id=$1", [customer.id.value])).rows).toEqual([{not_before: at(63)}]);
  });

  it("does not activate continuation from an uncorrelated AI message", async () => {
    await pool.query("update conversation_ai_response_jobs set status='SUPERSEDED',terminal_at=$1,updated_at=$1 where id='ai_job_turn_1'", [at(1)]);
    const messages = new PostgresConversationMessageRepository(pool);
    await messages.appendForInquiry("inquiry-1", Message.create({
      id: "legacy-ai-message", senderType: "AI_AGENT", channel: "WEBSITE", body: "Legacy AI response", createdAt: at(2),
    }));
    const customer = Message.create({id: "customer-after-legacy-ai", senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "en", body: "Follow-up", createdAt: at(3)});
    await messages.appendCustomerWebsiteForInquiry("inquiry-1", customer, {
      id: "ai_job_after_legacy_ai", triggerMessageId: customer.id.value, notBefore: at(63), continuationNotBefore: at(3),
      executionId: "ai_fallback_ai_job_after_legacy_ai", createdAt: at(3),
    });
    expect((await pool.query("select not_before from conversation_ai_response_jobs where id='ai_job_after_legacy_ai'")).rows).toEqual([{not_before: at(63)}]);
  });

  it("finalizes successive AI turns in ON_DEMAND without Staff translation jobs", async () => {
    await pool.query(`insert into conversation_translation_controls
      (conversation_id,customer_to_staff_mode,staff_to_customer_mode,ai_to_staff_mode,version,updated_at,updated_by)
      values ('conversation-1','MANUAL','MANUAL','ON_DEMAND',1,$1,'staff:member-1')`, [at(0)]);
    const routing = repository();
    const messages = new PostgresConversationMessageRepository(pool);
    for (let index = 0; index < 3; index += 1) {
      if (index > 0) await messages.appendCustomerWebsiteForInquiry("inquiry-1", Message.create({
        id: `on-demand-customer-${index}`, senderType: "CUSTOMER", channel: "WEBSITE", sourceLocale: "en",
        body: "Next customer question", createdAt: at(index * 10),
      }), {id: `ai_job_on_demand_${index}`, triggerMessageId: `on-demand-customer-${index}`, notBefore: at(index * 10), continuationNotBefore: at(index * 10),
        executionId: `on-demand-execution-${index}`, createdAt: at(index * 10)});
      const [job] = await routing.claimDue({limit: 1, now: at(index * 10 + 1), leaseMilliseconds: 60_000});
      expect(job).toBeDefined();
      expect(await routing.finalize({job: job!, body: "English AI response", decision: "RESPOND", now: at(index * 10 + 2)})).toBe("succeeded");
    }
    expect((await pool.query("select count(*)::int as count from conversation_messages where sender_type='AI_AGENT'")).rows[0].count).toBe(3);
    expect((await pool.query("select count(*)::int as count from conversation_translation_jobs")).rows[0].count).toBe(0);
    expect((await pool.query(`select l.source_locale,l.customer_target_locale from conversation_message_languages l
      join conversation_messages m on m.id=l.message_id where m.sender_type='AI_AGENT'`)).rows)
      .toEqual(Array.from({length: 3}, () => ({source_locale: "en", customer_target_locale: "en"})));
  });
  it.each([
    ["PENDING", "RESPOND", null], ["PENDING", null, "PRICE_QUOTATION"],
    ["SUCCEEDED", "UNKNOWN", null], ["SUCCEEDED", "ESCALATE", null],
    ["SUCCEEDED", "RESPOND", "PRICE_QUOTATION"], ["SUCCEEDED", "ESCALATE", "CUSTOMER_SUPPLIED_REASON"],
  ])("rejects invalid decision metadata (%s, %s, %s)", async (status, decision, reason) => {
    await expect(pool.query("update conversation_ai_response_jobs set status=$1, agent_decision=$2, escalation_reason=$3, terminal_at=$4, updated_at=$5 where id='ai_job_turn_1'", [status, decision, reason, status === "SUCCEEDED" ? at(1) : null, at(1)]))
      .rejects.toMatchObject({code: "23514"});
  });

  it("backfills pre-Agent successful rows before adding the new constraints", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("alter table conversation_ai_response_jobs drop column agent_decision cascade, drop column escalation_reason cascade");
      await client.query("update conversation_ai_response_jobs set status='SUCCEEDED', terminal_at=$1, updated_at=$1 where id='ai_job_turn_1'", [at(1)]);
      await client.query(readFileSync(resolve("drizzle/0019_conversation_ai_agent_escalations.sql"), "utf8"));
      expect((await client.query("select agent_decision, escalation_reason from conversation_ai_response_jobs")).rows).toEqual([{agent_decision: "RESPOND", escalation_reason: null}]);
    } finally { await client.query("rollback"); client.release(); }
  });

  it("rejects successful jobs without a decision at the database boundary", async () => {
    await expect(pool.query("update conversation_ai_response_jobs set status='SUCCEEDED', terminal_at=$1, updated_at=$1 where id='ai_job_turn_1'", [at(1)]))
      .rejects.toMatchObject({code: "23514", constraint: "conversation_ai_response_jobs_decision_check"});
  });

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
    await expect(first.finalize({job: stale, body: "Stale response", decision: "RESPOND", now: at(13)})).resolves.toBe("stale_lease");
    expect((await pool.query("select count(*)::int as count from conversation_messages where sender_type='AI_AGENT'")).rows[0].count).toBe(0);
  });

  it("lets a Staff reply win during generation and commits no generated text", async () => {
    const routing = repository();
    const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
    expect((await routing.prepare({job: job!, now: at(2), maximumAgeMilliseconds: 86_400_000})).status).toBe("eligible");
    const staff = Message.create({id: "staff-1", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member-1", body: "A human answer", createdAt: at(3)});
    await new PostgresConversationMessageRepository(pool).appendForInquiry("inquiry-1", staff);
    await expect(routing.finalize({job: job!, body: "Losing AI response", decision: "RESPOND", now: at(4)})).resolves.toBe("stale_lease");
    const rows = await pool.query("select sender_type, body from conversation_messages order by position");
    expect(rows.rows).toEqual([{sender_type: "CUSTOMER", body: "Customer question"}, {sender_type: "INTERNAL_USER", body: "A human answer"}]);
  });

  it("supersedes the old turn when a newer customer message commits first", async () => {
    const routing = repository();
    const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
    const customer = Message.create({id: "customer-2", senderType: "CUSTOMER", channel: "WEBSITE", body: "New question", createdAt: at(2)});
    await new PostgresConversationMessageRepository(pool).appendCustomerWebsiteForInquiry("inquiry-1", customer, {id: "ai_job_turn_2", triggerMessageId: "customer-2", notBefore: at(3), continuationNotBefore: at(2), executionId: "ai_fallback_ai_job_turn_2", createdAt: at(2)});
    await expect(routing.finalize({job: job!, body: "Stale AI response", decision: "RESPOND", now: at(4)})).resolves.toBe("stale_lease");
    const jobs = await pool.query("select id,status from conversation_ai_response_jobs order by id");
    expect(jobs.rows).toEqual([{id: "ai_job_turn_1", status: "SUPERSEDED"}, {id: "ai_job_turn_2", status: "PENDING"}]);
  });

  it("commits AI exactly once before a later Staff reply and exposes it through normal positions", async () => {
    const routing = repository();
    const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
    await expect(routing.finalize({job: job!, body: "AI response", decision: "RESPOND", now: at(2)})).resolves.toBe("succeeded");
    const staff = Message.create({id: "staff-2", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member-1", body: "Follow-up", createdAt: at(3)});
    await new PostgresConversationMessageRepository(pool).appendForInquiry("inquiry-1", staff);
    expect((await pool.query("select position,sender_type from conversation_messages order by position")).rows).toEqual([
      {position: 0, sender_type: "CUSTOMER"}, {position: 1, sender_type: "AI_AGENT"}, {position: 2, sender_type: "INTERNAL_USER"},
    ]);
    expect((await pool.query("select count(*)::int as count from conversation_messages where sender_type='AI_AGENT'")).rows[0].count).toBe(1);
    expect((await pool.query("select agent_decision,escalation_reason from conversation_ai_response_jobs where id='ai_job_turn_1'")).rows).toEqual([{agent_decision: "RESPOND", escalation_reason: null}]);
    expect((await pool.query("select source_locale,customer_target_locale from conversation_message_languages where message_id='ai_response_ai_job_turn_1'")).rows).toEqual([{source_locale: "en", customer_target_locale: "en"}]);
    const streamed = await new PostgresConversationMessageRepository(pool).findAfterPositionForInquiry("inquiry-1", 0, 10);
    expect(streamed?.map(({position, message}) => ({position, senderType: message.senderType, body: message.body}))).toEqual([
      {position: 1, senderType: "AI_AGENT", body: "AI response"}, {position: 2, senderType: "INTERNAL_USER", body: "Follow-up"},
    ]);
  });

  it("persists content-free typed escalation metadata for Staff visibility", async () => {
    const routing = repository();
    const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
    await expect(routing.finalize({job: job!, body: "Staff review is required.", decision: "ESCALATE", escalationReason: "PRICE_QUOTATION", now: at(2)})).resolves.toBe("succeeded");
    await expect(routing.readStatus("inquiry-1")).resolves.toMatchObject({latestJob: {status: "SUCCEEDED", decision: "ESCALATE", escalationReason: "PRICE_QUOTATION"}});
    expect((await pool.query("select agent_decision,escalation_reason from conversation_ai_response_jobs where id='ai_job_turn_1'")).rows).toEqual([{agent_decision: "ESCALATE", escalation_reason: "PRICE_QUOTATION"}]);
  });

  it("keeps pause and takeover auditable, versioned, and resume-only-for-future-turns", async () => {
    const routing = repository();
    expect(await routing.changeControl({inquiryId: "inquiry-1", state: "PAUSED", expectedVersion: 0, actorReference: "staff:member-1", eventId: "event-pause", now: at(1)})).toBe("updated");
    expect(await routing.changeControl({inquiryId: "inquiry-1", state: "HUMAN_TAKEOVER", expectedVersion: 0, actorReference: "staff:member-1", eventId: "event-stale", now: at(2)})).toBe("conflict");
    expect(await routing.changeControl({inquiryId: "inquiry-1", state: "AUTO", expectedVersion: 1, actorReference: "staff:member-1", eventId: "event-resume", now: at(3)})).toBe("updated");
    expect((await pool.query("select status from conversation_ai_response_jobs where id='ai_job_turn_1'")).rows[0].status).toBe("CANCELLED");
    const customer = Message.create({id: "customer-future", senderType: "CUSTOMER", channel: "WEBSITE", body: "Future turn", createdAt: at(4)});
    await new PostgresConversationMessageRepository(pool).appendCustomerWebsiteForInquiry("inquiry-1", customer, {id: "ai_job_future", triggerMessageId: "customer-future", notBefore: at(5), continuationNotBefore: at(4), executionId: "ai_fallback_ai_job_future", createdAt: at(4)});
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
      await expect(routing.finalize({job: job!, body: "Suppressed", decision: "RESPOND", now: at(3)})).resolves.toBe("stale_lease");
    }
    await clean(); await seed();
    const routing = repository();
    const [job] = await routing.claimDue({limit: 1, now: at(1), leaseMilliseconds: 60_000});
    globalAllowed = false;
    await expect(routing.finalize({job: job!, body: "Disabled", decision: "RESPOND", now: at(2)})).resolves.toBe("cancelled");
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
        id: "ai_job_disable_race", triggerMessageId: customer.id.value, notBefore: at(61), continuationNotBefore: at(1),
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
      id: "ai_job_missing_policy", triggerMessageId: customer.id.value, notBefore: at(61), continuationNotBefore: at(1),
      executionId: "ai_fallback_ai_job_missing_policy", createdAt: at(1),
    });
    expect((await pool.query("select id,status from conversation_ai_response_jobs order by id")).rows).toEqual([
      {id: "ai_job_turn_1", status: "SUPERSEDED"},
    ]);
  });
});
