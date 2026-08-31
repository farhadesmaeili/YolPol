import {resolve} from "node:path";
import {readFile} from "node:fs/promises";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

import {DuplicateInquiryIdError} from "@/features/inquiries/application/ports/inquiry-ports";
import {toConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";
import {GetConversationMessageHistory} from "@/features/inquiries/application/use-cases/get-conversation-message-history";
import {ReadNewConversationMessages} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {ReceiveCustomerMessage} from "@/features/inquiries/application/use-cases/receive-customer-message";
import {SendStaffConversationReply} from "@/features/inquiries/application/use-cases/send-staff-conversation-reply";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {createStaffPrincipal} from "@/features/staff-authentication/application/use-cases/staff-principal-factory";
import {Conversation} from "@/features/inquiries/domain/entities/conversation";
import {Message} from "@/features/inquiries/domain/entities/message";
import type {InquiryItemInput} from "@/features/inquiries/domain/types/inquiry-types";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {PostgresInquiryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-repository";
import {PostgresInquiryOutbox} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-outbox";
import {PostgresInquiryWorkflowRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-workflow-repository";
import {PostgresConversationAccessRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-access-repository";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {NodeConversationAccessTokenService} from "@/features/inquiries/infrastructure/security/conversation-access-token-service";
import {NodeStaffReplyMessageIdFactory} from "@/features/inquiries/infrastructure/security/staff-reply-message-id-factory";
import {inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";
import {inquiryFixture} from "@/features/inquiries/testing/fixtures/inquiry-fixtures";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";
import {createInquiryRequestHandler} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";
import {createInquirySubmission} from "@/composition/inquiries/inquiry-submission";
import {deleteExpiredInquiries, inquiryRetentionCutoff} from "../../../../../tooling/retention/delete-expired-inquiries.mjs";
import {createAssignmentWorkflowEvent, createStatusChangedWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";
import {TeamMember} from "@/features/inquiries/domain/entities/team-member";

let pool: Pool;
let repository: PostgresInquiryRepository;
let workflowRepository: PostgresInquiryWorkflowRepository;
let messageRepository: PostgresConversationMessageRepository;

const item = (position: number, unit: InquiryItemInput["unit"]): InquiryItemInput => ({
  productId: `test-product-${position}`,
  sku: `TEST-SKU-${position}`,
  slug: `test-product-${position}`,
  productName: `Test Product ${position}`,
  quantity: position * 10,
  unit,
});

async function cleanInquiryIntegrationTables() {
  // Staff Auth tables are explicit because their FK chain references Inquiry Team Members.
  await pool.query("truncate table ai_schedule_windows, ai_policy_events, ai_operation_policy, telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, conversation_access, conversation_messages, inquiry_assignments, inquiry_workflow_events, conversations, inquiry_outbox, inquiry_items, inquiry_team_members, inquiries");
}

beforeAll(async () => {
  pool = createPostgresPool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: inquiryPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  repository = new PostgresInquiryRepository(pool);
  workflowRepository = new PostgresInquiryWorkflowRepository(pool);
  messageRepository = new PostgresConversationMessageRepository(pool);
});

beforeEach(async () => {
  const identity = await pool.query<{current_database: string; current_user: string}>("select current_database(), current_user");
  expect(identity.rows[0]).toEqual({current_database: "yolpol_integration", current_user: "yolpol_test"});
  await cleanInquiryIntegrationTables();
});

afterEach(async () => { vi.unstubAllEnvs(); await cleanInquiryIntegrationTables(); });

afterAll(async () => { if (pool) await pool.end(); });

describe("PostgresInquiryRepository", () => {
  it("persists an idempotent Staff reply once and exposes it through ordered history and SSE reads", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "staff-reply-integration"}).buildNew();
    const conversation = Conversation.start({
      id: inquiry.id.value,
      inquiryId: inquiry.id.value,
      channel: "WEBSITE",
      createdAt: inquiry.createdAt,
    });
    conversation.addMessage({
      id: "legacy-customer-message",
      senderType: "CUSTOMER",
      channel: "WEBSITE",
      body: "Please send an update.",
      createdAt: inquiry.createdAt,
    });
    await repository.save(inquiry, undefined, conversation);

    const principal = createStaffPrincipal({
      staffAccountId: "staff-integration",
      teamMemberId: "member-integration",
      role: "SALES",
      teamMemberDisplayName: "Integration Staff",
    });
    const actorReference = new StaffAuthorizationPolicy().actorReferenceFor(principal);
    const sendReply = new SendStaffConversationReply(
      repository,
      messageRepository,
      new NodeStaffReplyMessageIdFactory(),
      {now: () => new Date("2026-08-26T12:30:00.000Z")},
    );
    const command = {
      inquiryId: inquiry.id.value,
      body: "We are reviewing your request.",
      clientMessageId: "019d-integration-reply-1",
      actorReference,
    } as const;

    const first = await sendReply.execute(command);
    const retry = await sendReply.execute(command);
    expect(first).toMatchObject({status: "sent", idempotent: false, message: {
      senderType: "INTERNAL_USER",
      channel: "WEBSITE",
      actorReference,
      body: command.body,
    }});
    expect(retry).toEqual({...first, idempotent: true});

    const rows = await pool.query<{
      position: number;
      sender_type: string;
      channel: string;
      actor_reference: string | null;
      body: string;
    }>("select position,sender_type,channel,actor_reference,body from conversation_messages where conversation_id=$1 order by position", [inquiry.id.value]);
    expect(rows.rows).toEqual([
      {position: 0, sender_type: "CUSTOMER", channel: "WEBSITE", actor_reference: null, body: "Please send an update."},
      {position: 1, sender_type: "INTERNAL_USER", channel: "WEBSITE", actor_reference: actorReference, body: command.body},
    ]);

    const internalMessages = await messageRepository.findForInquiry(inquiry.id.value);
    expect(internalMessages?.map((message) => message.actorReference?.value ?? null)).toEqual([null, actorReference]);
    const positionedStaffMessages = await messageRepository.findPositionedForInquiry(inquiry.id.value);
    expect(positionedStaffMessages?.map(({position, message}) => ({position, actorReference: message.actorReference?.value ?? null}))).toEqual([
      {position: 0, actorReference: null},
      {position: 1, actorReference},
    ]);

    const customerHistory = await new GetConversationMessageHistory(messageRepository).execute({inquiryId: inquiry.id.value});
    expect(customerHistory).toMatchObject({status: "found", messages: [
      {senderType: "CUSTOMER", channel: "WEBSITE", body: "Please send an update."},
      {senderType: "INTERNAL_USER", channel: "WEBSITE", body: command.body},
    ]});
    const customerUpdates = await new ReadNewConversationMessages(messageRepository, toConversationMessageDto).execute({inquiryId: inquiry.id.value, afterCursor: 0});
    expect(customerUpdates).toMatchObject({status: "found", updates: [{cursor: 1, message: {senderType: "INTERNAL_USER", channel: "WEBSITE", body: command.body}}]});
    expect(JSON.stringify({customerHistory, customerUpdates})).not.toMatch(/actorReference|staff:member-integration|member-integration/u);

    expect((await pool.query("select status from inquiries where id=$1", [inquiry.id.value])).rows).toEqual([{status: "NEW"}]);
    expect((await pool.query("select event_type from inquiry_workflow_events where inquiry_id=$1", [inquiry.id.value])).rows).toEqual([{event_type: "INQUIRY_CREATED"}]);
    expect((await pool.query("select inquiry_id from inquiry_assignments where inquiry_id=$1", [inquiry.id.value])).rowCount).toBe(0);
  });

  it("atomically emits one minimal customer-message outbox event for a created Website message", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "customer-message-outbox"}).buildNew();
    const conversation = Conversation.start({
      id: "customer-message-conversation",
      inquiryId: inquiry.id.value,
      channel: "WEBSITE",
      createdAt: inquiry.createdAt,
    });
    await repository.save(inquiry, undefined, conversation);
    const receive = new ReceiveCustomerMessage(
      messageRepository,
      {generate: () => "customer-message-accepted-1"},
      {now: () => new Date("2026-08-27T09:00:00.000Z")},
    );

    await expect(receive.execute({inquiryId: inquiry.id.value, message: " Please confirm the sailing date. "}))
      .resolves.toEqual({status: "created", messageId: "customer-message-accepted-1"});
    await expect(receive.execute({inquiryId: inquiry.id.value, message: "Please confirm the sailing date."}))
      .resolves.toEqual({status: "conflict"});

    const messages = await pool.query<{id: string; sender_type: string; channel: string; body: string}>(
      "select id,sender_type,channel,body from conversation_messages where conversation_id=$1",
      [conversation.id.value],
    );
    expect(messages.rows).toEqual([{
      id: "customer-message-accepted-1",
      sender_type: "CUSTOMER",
      channel: "WEBSITE",
      body: "Please confirm the sailing date.",
    }]);

    const events = await pool.query<{
      id: string;
      event_type: string;
      aggregate_id: string;
      payload: Record<string, unknown>;
    }>("select id,event_type,aggregate_id,payload from inquiry_outbox where aggregate_id=$1", [inquiry.id.value]);
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]).toEqual({
      id: expect.stringMatching(/^customer_message_[a-f0-9]{64}$/u),
      event_type: "CustomerConversationMessageCreated",
      aggregate_id: inquiry.id.value,
      payload: {
        inquiryId: inquiry.id.value,
        conversationId: conversation.id.value,
        messageId: "customer-message-accepted-1",
        occurredAt: "2026-08-27T09:00:00.000Z",
      },
    });
    expect(Object.keys(events.rows[0]!.payload).sort()).toEqual(["conversationId", "inquiryId", "messageId", "occurredAt"]);
    const payloadText = JSON.stringify(events.rows[0]!.payload);
    for (const forbidden of [
      "Please confirm the sailing date.",
      inquiry.contact.fullName,
      inquiry.contact.email,
      inquiry.contact.phone,
      "INTERNAL-PRICE-SENTINEL",
      "BOT-TOKEN-SENTINEL",
      "DATABASE-URL-SENTINEL",
    ]) expect(payloadText).not.toContain(forbidden);

    const [pending] = await new PostgresInquiryOutbox(pool).claimPending(1, new Date("2026-08-27T09:00:01.000Z"));
    expect(pending).toEqual({
      event: {
        eventId: events.rows[0]!.id,
        type: "CustomerConversationMessageCreated",
        inquiryId: inquiry.id.value,
        conversationId: conversation.id.value,
        messageId: "customer-message-accepted-1",
        occurredAt: new Date("2026-08-27T09:00:00.000Z"),
      },
      attempts: 1,
    });
  });

  it("rolls back the customer message when its required outbox insert fails", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "customer-message-atomic"}).buildNew();
    const conversation = Conversation.start({
      id: "customer-message-atomic-conversation",
      inquiryId: inquiry.id.value,
      channel: "WEBSITE",
      createdAt: inquiry.createdAt,
    });
    await repository.save(inquiry, undefined, conversation);
    await pool.query(`
      create function reject_customer_message_outbox_for_atomicity_test() returns trigger language plpgsql as $$
      begin
        if new.event_type = 'CustomerConversationMessageCreated' then
          raise exception 'forced customer message outbox failure';
        end if;
        return new;
      end
      $$
    `);
    await pool.query(`
      create trigger reject_customer_message_outbox_for_atomicity_test
      before insert on inquiry_outbox
      for each row execute function reject_customer_message_outbox_for_atomicity_test()
    `);
    try {
      const message = Message.create({
        id: "customer-message-rollback",
        senderType: "CUSTOMER",
        channel: "WEBSITE",
        body: "This message must roll back.",
        createdAt: new Date("2026-08-27T09:05:00.000Z"),
      });
      await expect(messageRepository.appendCustomerWebsiteForInquiry(inquiry.id.value, message)).rejects.toBeInstanceOf(InquiryPersistenceError);
      expect((await pool.query("select id from conversation_messages where id=$1", [message.id.value])).rowCount).toBe(0);
      expect((await pool.query("select id from inquiry_outbox where aggregate_id=$1", [inquiry.id.value])).rowCount).toBe(0);
    } finally {
      await pool.query("drop trigger if exists reject_customer_message_outbox_for_atomicity_test on inquiry_outbox");
      await pool.query("drop function if exists reject_customer_message_outbox_for_atomicity_test()");
    }
  });

  it("does not emit customer-message events for Staff, Telegram, AI, or System messages", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "customer-message-anti-loop"}).buildNew();
    const conversation = Conversation.start({
      id: "customer-message-anti-loop-conversation",
      inquiryId: inquiry.id.value,
      channel: "WEBSITE",
      createdAt: inquiry.createdAt,
    });
    await repository.save(inquiry, undefined, conversation);
    const messages = [
      Message.create({id: "staff-website-no-event", senderType: "INTERNAL_USER", channel: "WEBSITE", actorReference: "staff:member-1", body: "Staff Website reply", createdAt: new Date("2026-08-27T09:10:00.000Z")}),
      Message.create({id: "telegram-no-event", senderType: "INTERNAL_USER", channel: "TELEGRAM", actorReference: "staff:member-1", body: "Telegram reply", createdAt: new Date("2026-08-27T09:11:00.000Z")}),
      Message.create({id: "ai-no-event", senderType: "AI_AGENT", channel: "WEBSITE", body: "AI response", createdAt: new Date("2026-08-27T09:12:00.000Z")}),
      Message.create({id: "system-no-event", senderType: "SYSTEM", channel: "WEBSITE", body: "System response", createdAt: new Date("2026-08-27T09:13:00.000Z")}),
    ];

    await expect(messageRepository.appendForInquiry(inquiry.id.value, messages[0]!)).resolves.toBe("created");
    await expect(messageRepository.appendForConversation(conversation.id.value, messages[1]!)).resolves.toBe("created");
    await expect(messageRepository.appendForInquiry(inquiry.id.value, messages[2]!)).resolves.toBe("created");
    await expect(messageRepository.appendForInquiry(inquiry.id.value, messages[3]!)).resolves.toBe("created");
    expect((await pool.query("select id from inquiry_outbox where aggregate_id=$1", [inquiry.id.value])).rowCount).toBe(0);
  });

  it("upgrades every historical contact preference without changing legacy item semantics", async () => {
    const splitMigration = (sql: string) => sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
    const baseline = await readFile(resolve("drizzle/0000_hot_lorna_dane.sql"), "utf8");
    const upgrade = await readFile(resolve("drizzle/0001_fast_wild_child.sql"), "utf8");
    const sourceUrl = new URL(process.env.INTEGRATION_DATABASE_URL!);
    const upgradeDatabase = "yolpol_migration_upgrade";
    const upgradeUrl = new URL(sourceUrl);
    upgradeUrl.pathname = `/${upgradeDatabase}`;
    const upgradePool = new Pool({connectionString: upgradeUrl.toString(), max: 1});
    await pool.query(`drop database if exists ${upgradeDatabase} with (force)`);
    await pool.query(`create database ${upgradeDatabase}`);
    try {
      for (const statement of splitMigration(baseline)) await upgradePool.query(statement);
      const insert = "insert into inquiries (id,status,full_name,email,phone,telegram_username,preferred_contact_method,country,source_locale,source_path,privacy_accepted,privacy_accepted_at,privacy_policy_version,created_at,updated_at) values ($1,'received','Legacy Customer','legacy@example.test',$2,$3,$4,'Legacy Country','en','/en/inquiry',true,'2026-01-01','legacy-v1','2026-01-01','2026-01-01')";
      const historicalContacts = [
        ["legacy-email", "+989121234567", null, "email"],
        ["legacy-whatsapp-iran", "+989121234567", null, "whatsapp"],
        ["legacy-whatsapp-iran-spaced", "+98 912 123 4567", null, "whatsapp"],
        ["legacy-whatsapp-turkey", "+90 (532) 123 45 67", null, "whatsapp"],
        ["legacy-whatsapp-iraq", "+964 770 123 4567", null, "whatsapp"],
        ["legacy-whatsapp-double-hyphen", "+1--234567", null, "whatsapp"],
        ["legacy-whatsapp-leading-hyphen", "+-1234567", null, "whatsapp"],
        ["legacy-whatsapp-leading-space", "+ 1234567", null, "whatsapp"],
        ["legacy-whatsapp-double-plus", "++1234567", null, "whatsapp"],
        ["legacy-whatsapp-open-parens", "+12((34567", null, "whatsapp"],
        ["legacy-whatsapp-close-parens", "+12))34567", null, "whatsapp"],
        ["legacy-whatsapp-separated-space", "+12- -34567", null, "whatsapp"],
        ["legacy-whatsapp-alpha", "+123abc4567", null, "whatsapp"],
        ["legacy-whatsapp-no-plus", "123456789", null, "whatsapp"],
        ["legacy-telegram-valid", "+905321234567", "valid_user", "telegram"],
        ["legacy-telegram-old", "+905321234567", "legacy.name", "telegram"],
        ["legacy-phone", "legacy phone", null, "phone"],
      ] as const;
      for (const contact of historicalContacts) await upgradePool.query(insert, [...contact]);
      for (const [position, unit] of (["pieces", "packages", "pallets", "truckloads"] as const).entries()) {
        await upgradePool.query("insert into inquiry_items (inquiry_id,position,product_id,sku,slug,product_name,quantity,unit) values ('legacy-email',$1,$2,$3,$4,$5,$6,$7)", [position, `legacy-product-${position}`, `LEGACY-${position}`, `legacy-product-${position}`, `Legacy Product ${position}`, position + 1, unit]);
      }
      for (const statement of splitMigration(upgrade)) await upgradePool.query(statement);

      const migrated = await upgradePool.query<{id:string;preferred_contact_methods:string[];whatsapp_phone:string|null;telegram_username:string|null}>("select id,preferred_contact_methods,whatsapp_phone,telegram_username from inquiries order by id");
      expect(migrated.rowCount).toBe(historicalContacts.length);
      const byId = new Map(migrated.rows.map((row) => [row.id, row]));
      expect(byId.get("legacy-email")?.preferred_contact_methods).toEqual(["email"]);
      expect(byId.get("legacy-phone")?.preferred_contact_methods).toEqual(["phone"]);
      expect(byId.get("legacy-telegram-valid")).toMatchObject({preferred_contact_methods:["telegram"], telegram_username:"@valid_user"});
      expect(byId.get("legacy-telegram-old")).toMatchObject({preferred_contact_methods:["telegram"], telegram_username:"@legacy.name"});
      expect(byId.get("legacy-whatsapp-iran")?.whatsapp_phone).toBe("+989121234567");
      expect(byId.get("legacy-whatsapp-iran-spaced")?.whatsapp_phone).toBe("+989121234567");
      expect(byId.get("legacy-whatsapp-turkey")?.whatsapp_phone).toBe("+905321234567");
      expect(byId.get("legacy-whatsapp-iraq")?.whatsapp_phone).toBe("+9647701234567");
      for (const id of historicalContacts.map(([id]) => id).filter((id) => id.startsWith("legacy-whatsapp-") && !["legacy-whatsapp-iran", "legacy-whatsapp-iran-spaced", "legacy-whatsapp-turkey", "legacy-whatsapp-iraq"].includes(id))) {
        expect(byId.get(id)).toMatchObject({preferred_contact_methods:["whatsapp"], whatsapp_phone:null});
      }
      const items = await upgradePool.query<{position:number;unit:string}>("select position,unit from inquiry_items where inquiry_id='legacy-email' order by position");
      expect(items.rows).toEqual([{position:0,unit:"pieces"},{position:1,unit:"packages"},{position:2,unit:"pallets"},{position:3,unit:"truckloads"}]);
      const foreignKey = await upgradePool.query<{foreign_table:string}>("select ccu.table_name as foreign_table from information_schema.table_constraints tc join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema where tc.constraint_schema='public' and tc.constraint_name='inquiry_items_inquiry_id_inquiries_id_fk'");
      expect(foreignKey.rows).toEqual([{foreign_table:"inquiries"}]);
      const priceColumns = await upgradePool.query("select column_name from information_schema.columns where table_schema='public' and table_name in ('inquiries','inquiry_items') and column_name like '%price%'");
      expect(priceColumns.rowCount).toBe(0);
    } finally {
      await upgradePool.end();
      await pool.query(`drop database if exists ${upgradeDatabase} with (force)`);
    }
  });

  it("executes the real POST composition through trusted Product resolution and PostgreSQL", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const handler=createInquiryRequestHandler(()=>createInquirySubmission(repository));
    const payload={contact:{fullName:"Integration Customer",email:"integration@example.test",phone:"989123456789",preferredMethods:["email","whatsapp","telegram"],whatsappPhone:"989123456780",telegramUsername:"@integration_customer"},location:{country:"TR"},privacy:{accepted:true,policyVersion:"inquiry-contact-consent-v2"},source:{locale:"en",path:"/en/inquiry"},items:[{productId:"ylp-gb-250-og-rd",palletCount:27},{productId:"ylp-gb-250-cl-rd",palletCount:25}]};
    const response=await handler(new Request("http://localhost/api/inquiries",{method:"POST",headers:{"Content-Type":"application/json",Origin:"http://localhost:3000",Host:"localhost:3000"},body:JSON.stringify(payload)}));
    expect(response.status).toBe(201);
    const responseBody=await response.json() as {status:string;inquiryId:string};
    expect(responseBody).toEqual({status:"created",inquiryId:expect.any(String)});
    const cookie=response.headers.get("Set-Cookie")!;
    const conversationAccessToken=/yolpol_customer_conversation=(ypc_[A-Za-z0-9_-]{43})/u.exec(cookie)?.[1];
    expect(conversationAccessToken).toMatch(/^ypc_[A-Za-z0-9_-]{43}$/u);
    const roots=await pool.query<{id:string}>("select id from inquiries"); expect(roots.rowCount).toBe(1);
    const conversations=await pool.query<{id:string;inquiry_id:string;channel:string}>("select id,inquiry_id,channel from conversations");
    expect(conversations.rows).toEqual([{id:roots.rows[0]?.id,inquiry_id:roots.rows[0]?.id,channel:"WEBSITE"}]);
    const accessRows=await pool.query<{conversation_id:string;token_lookup:string;token_hash:string}>("select conversation_id,token_lookup,token_hash from conversation_access");
    expect(accessRows.rows).toEqual([{conversation_id:roots.rows[0]?.id,token_lookup:expect.stringMatching(/^[a-f0-9]{64}$/u),token_hash:expect.stringMatching(/^[a-f0-9]{64}$/u)}]);
    expect(JSON.stringify(accessRows.rows)).not.toContain(conversationAccessToken);
    const presented=new NodeConversationAccessTokenService().inspect(conversationAccessToken!)!;
    expect((await new PostgresConversationAccessRepository(pool).findByLookup(presented.lookup))?.inquiryId).toBe(roots.rows[0]?.id);
    expect((await pool.query("select id from conversation_messages")).rowCount).toBe(0);
    const events=await pool.query<{event_type:string;aggregate_id:string;payload:{inquiryId:string;occurredAt:string};attempts:number;processed_at:Date|null}>("select event_type,aggregate_id,payload,attempts,processed_at from inquiry_outbox");
    expect(events.rows).toEqual([{event_type:"InquiryCreated",aggregate_id:roots.rows[0]?.id,payload:{inquiryId:roots.rows[0]?.id,occurredAt:expect.any(String)},attempts:0,processed_at:null}]);
    expect(JSON.stringify(events.rows[0]?.payload)).not.toMatch(/price|secret|credential|token|api.?key/i);
    const workflowEvents=await pool.query<{event_type:string;previous_value:string|null;new_value:string|null;actor_reference:string|null}>("select event_type,previous_value,new_value,actor_reference from inquiry_workflow_events");
    expect(workflowEvents.rows).toEqual([{event_type:"INQUIRY_CREATED",previous_value:null,new_value:"NEW",actor_reference:null}]);
    const rows=await pool.query<{position:number;product_id:string;sku:string;slug:string;product_name:string;quantity:number;unit:string}>("select position,product_id,sku,slug,product_name,quantity,unit from inquiry_items order by position");
    expect(rows.rows).toEqual([
      {position:0,product_id:"ylp-gb-250-og-rd",sku:"YLP-GB-250-OG-RD",slug:"250ml-olive-green-round-glass-bottle",product_name:"250ml Olive Green Round Glass Bottle",quantity:27,unit:"pallets"},
      {position:1,product_id:"ylp-gb-250-cl-rd",sku:"YLP-GB-250-CL-RD",slug:"250ml-clear-round-glass-bottle",product_name:"250ml Clear Round Glass Bottle",quantity:25,unit:"pallets"},
    ]);
  });

  it("persists canonical Persian pallet and Package quantities without conversion", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const handler = createInquiryRequestHandler(() => createInquirySubmission(repository));
    const payload = {
      contact: {fullName:"Integration Customer",email:"integration@example.test",phone:"989123456789",preferredMethods:["email"]},
      location: {country:"IR"},
      privacy: {accepted:true,policyVersion:"inquiry-contact-consent-v2"},
      source: {locale:"fa",path:"/fa/inquiry"},
      items: [
        {productId:"ylp-gb-250-og-rd",quantity:4,unit:"pallets"},
        {productId:"ylp-gb-250-cl-rd",quantity:37,unit:"packages"},
      ],
    };
    const response = await handler(new Request("http://localhost/api/inquiries", {method:"POST",headers:{"Content-Type":"application/json",Origin:"http://localhost:3000",Host:"localhost:3000"},body:JSON.stringify(payload)}));
    expect(response.status).toBe(201);
    const rows = await pool.query<{position:number;product_id:string;quantity:number;unit:string}>("select position,product_id,quantity,unit from inquiry_items order by position");
    expect(rows.rows).toEqual([
      {position:0,product_id:"ylp-gb-250-og-rd",quantity:4,unit:"pallets"},
      {position:1,product_id:"ylp-gb-250-cl-rd",quantity:37,unit:"packages"},
    ]);
  });

  it.each([
    {items:[]},
    {items:[{productId:"unknown-product",quantity:1,unit:"pieces"}]},
    {items:[{productId:"ylp-gb-250-og-rd",quantity:1,unit:"pieces",sku:"BROWSER-SKU"}]},
  ])("creates no rows for an invalid full-path request",async change=>{
    const handler=createInquiryRequestHandler(()=>createInquirySubmission(repository));
    const payload={contact:{fullName:"Integration Customer",email:"integration@example.test",phone:"+98 912 345 6789",preferredMethod:"email"},location:{country:"Iran"},privacy:{accepted:true,policyVersion:"inquiry-contact-consent-v1"},source:{locale:"en",path:"/en/inquiry"},...change};
    const response=await handler(new Request("https://yolpol.com/api/inquiries",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}));
    expect(response.status).toBe(422); expect((await pool.query("select id from inquiries")).rowCount).toBe(0); expect((await pool.query("select inquiry_id from inquiry_items")).rowCount).toBe(0); expect((await pool.query("select id from conversations")).rowCount).toBe(0); expect((await pool.query("select conversation_id from conversation_access")).rowCount).toBe(0); expect((await pool.query("select id from conversation_messages")).rowCount).toBe(0); expect((await pool.query("select id from inquiry_outbox")).rowCount).toBe(0);
  });

  it("deletes only records strictly older than the 24-month cutoff and cascades children",async()=>{
    const cutoff=inquiryRetentionCutoff(new Date("2026-08-23T12:00:00.000Z"));
    const make=(id:string,createdAt:Date)=>new InquiryTestBuilder().with({id,createdAt,privacy:{...inquiryFixture.privacy,acceptedAt:createdAt}}).buildNew();
    await repository.save(make("expired-inquiry",new Date(cutoff.getTime()-1)));
    await repository.save(make("boundary-inquiry",cutoff));
    await repository.save(make("new-inquiry",new Date(cutoff.getTime()+1)));
    await pool.query("create temporary table retention_sentinel (value text not null)"); await pool.query("insert into retention_sentinel values ('keep')");
    expect(await deleteExpiredInquiries(pool,cutoff)).toBe(1);
    expect((await pool.query("select id from inquiries order by id")).rows).toEqual([{id:"boundary-inquiry"},{id:"new-inquiry"}]);
    expect((await pool.query("select inquiry_id from inquiry_items where inquiry_id='expired-inquiry'")).rowCount).toBe(0);
    expect((await pool.query("select value from retention_sentinel")).rows).toEqual([{value:"keep"}]);
  });
  it("applies committed migrations and exposes the expected tables", async () => {
    await migrate(drizzle(pool, {schema: inquiryPostgresSchema}), {migrationsFolder: resolve("drizzle")});
    const result = await pool.query<{table_name: string}>("select table_name from information_schema.tables where table_schema = 'public' and table_name in ('ai_operation_policy','ai_policy_events','ai_schedule_windows','communication_recipients','conversation_access','conversation_messages','conversations','inquiries','inquiry_assignments','inquiry_items','inquiry_outbox','inquiry_team_members','inquiry_workflow_events','telegram_connection_requests','telegram_inquiry_deliveries','telegram_staff_links') order by table_name");
    expect(result.rows.map(({table_name}) => table_name)).toEqual(["ai_operation_policy", "ai_policy_events", "ai_schedule_windows", "communication_recipients", "conversation_access", "conversation_messages", "conversations", "inquiries", "inquiry_assignments", "inquiry_items", "inquiry_outbox", "inquiry_team_members", "inquiry_workflow_events", "telegram_connection_requests", "telegram_inquiry_deliveries", "telegram_staff_links"]);
    const migrations = await pool.query<{count: string}>("select count(*) from drizzle.__drizzle_migrations");
    expect(migrations.rows[0]?.count).toBe("15");
    const outboxEventTypeConstraint = await pool.query<{definition: string}>(`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname = 'inquiry_outbox_event_type_check'
    `);
    expect(outboxEventTypeConstraint.rows).toEqual([{
      definition: "CHECK (((event_type)::text = ANY ((ARRAY['InquiryCreated'::character varying, 'CustomerConversationMessageCreated'::character varying])::text[])))",
    }]);
    const actorColumn = await pool.query<{is_nullable: string; character_maximum_length: number}>("select is_nullable,character_maximum_length from information_schema.columns where table_schema='public' and table_name='conversation_messages' and column_name='actor_reference'");
    expect(actorColumn.rows).toEqual([{is_nullable: "YES", character_maximum_length: 160}]);
  });

  it("persists status and assignment changes with ordered immutable workflow history", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "workflow-persistence"}).buildNew();
    await repository.save(inquiry);
    await pool.query("insert into inquiry_team_members (id,display_name,active,created_at,updated_at) values ('member-1','Active member',true,'2026-01-01','2026-01-01'),('member-2','Inactive member',false,'2026-01-01','2026-01-01')");

    const restored = await repository.findById(inquiry.id.value);
    expect(restored).not.toBeNull();
    const statusAt = new Date("2026-01-02T00:00:00.000Z");
    restored!.transitionTo("WAITING_FOR_TEAM", statusAt);
    const statusEvent = createStatusChangedWorkflowEvent(inquiry.id.value, "NEW", "WAITING_FOR_TEAM", "TEAM:member-1", statusAt);
    await expect(workflowRepository.changeStatus(restored!, {status:"NEW",updatedAt:inquiry.updatedAt}, statusEvent)).resolves.toBe("changed");

    const assignment = await workflowRepository.findAssignment(inquiry.id.value);
    assignment.assignTo(TeamMember.reconstitute("member-1", true), new Date("2026-01-03T00:00:00.000Z"));
    const assignmentEvent = createAssignmentWorkflowEvent(inquiry.id.value, null, "member-1", "TEAM:member-1", new Date("2026-01-03T00:00:00.000Z"));
    await expect(workflowRepository.changeAssignment(assignment, {teamMemberId:null,changedAt:null}, assignmentEvent)).resolves.toBe("changed");

    const history = await workflowRepository.readHistory(inquiry.id.value);
    expect(history.map(({type,previousValue,newValue}) => ({type,previousValue,newValue}))).toEqual([
      {type:"INQUIRY_CREATED",previousValue:null,newValue:"NEW"},
      {type:"STATUS_CHANGED",previousValue:"NEW",newValue:"WAITING_FOR_TEAM"},
      {type:"ASSIGNED",previousValue:null,newValue:"member-1"},
    ]);
    expect((await repository.findById(inquiry.id.value))?.status).toBe("WAITING_FOR_TEAM");
    expect((await workflowRepository.findAssignment(inquiry.id.value)).teamMemberId).toBe("member-1");
  });

  it("rejects an assignment when the member becomes inactive before the atomic write", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "inactive-assignment"}).buildNew();
    await repository.save(inquiry);
    await pool.query("insert into inquiry_team_members (id,display_name,active,created_at,updated_at) values ('member-2','Inactive member',false,'2026-01-01','2026-01-01')");
    const assignment = await workflowRepository.findAssignment(inquiry.id.value);
    assignment.assignTo(TeamMember.reconstitute("member-2", true), new Date("2026-01-02T00:00:00.000Z"));
    const event = createAssignmentWorkflowEvent(inquiry.id.value, null, "member-2", null, new Date("2026-01-02T00:00:00.000Z"));
    await expect(workflowRepository.changeAssignment(assignment, {teamMemberId:null,changedAt:null}, event)).resolves.toBe("member_inactive");
    expect((await pool.query("select inquiry_id from inquiry_assignments")).rowCount).toBe(0);
    expect(await workflowRepository.readHistory(inquiry.id.value)).toHaveLength(1);
  });

  it("conflicts a stale status change after a simple concurrent update without appending history", async () => {
    const inquiry = new InquiryTestBuilder().with({id:"status-simple-conflict"}).buildNew();
    await repository.save(inquiry);
    const first = (await repository.findById(inquiry.id.value))!;
    first.transitionTo("WAITING_FOR_TEAM", new Date("2026-01-02T00:00:00.000Z"));
    await workflowRepository.changeStatus(first, {status:"NEW",updatedAt:inquiry.updatedAt}, createStatusChangedWorkflowEvent(inquiry.id.value,"NEW","WAITING_FOR_TEAM",null,new Date("2026-01-02T00:00:00.000Z")));

    const stale = (await repository.findById(inquiry.id.value))!;
    const concurrent = (await repository.findById(inquiry.id.value))!;
    concurrent.transitionTo("WAITING_FOR_CUSTOMER", new Date("2026-01-03T00:00:00.000Z"));
    await expect(workflowRepository.changeStatus(concurrent, {status:"WAITING_FOR_TEAM",updatedAt:new Date("2026-01-02T00:00:00.000Z")}, createStatusChangedWorkflowEvent(inquiry.id.value,"WAITING_FOR_TEAM","WAITING_FOR_CUSTOMER",null,new Date("2026-01-03T00:00:00.000Z")))).resolves.toBe("changed");

    stale.transitionTo("CLOSED", new Date("2026-01-04T00:00:00.000Z"));
    await expect(workflowRepository.changeStatus(stale, {status:"WAITING_FOR_TEAM",updatedAt:new Date("2026-01-02T00:00:00.000Z")}, createStatusChangedWorkflowEvent(inquiry.id.value,"WAITING_FOR_TEAM","CLOSED",null,new Date("2026-01-04T00:00:00.000Z")))).resolves.toBe("conflict");
    expect(await workflowRepository.readHistory(inquiry.id.value)).toHaveLength(3);
  });

  it("conflicts a stale status change after WAITING_FOR_TEAM ABA even when the status matches again", async () => {
    const inquiry = new InquiryTestBuilder().with({id:"status-aba"}).buildNew();
    await repository.save(inquiry);
    const initial = (await repository.findById(inquiry.id.value))!;
    initial.transitionTo("WAITING_FOR_TEAM", new Date("2026-01-02T00:00:00.000Z"));
    await workflowRepository.changeStatus(initial, {status:"NEW",updatedAt:inquiry.updatedAt}, createStatusChangedWorkflowEvent(inquiry.id.value,"NEW","WAITING_FOR_TEAM",null,new Date("2026-01-02T00:00:00.000Z")));
    const stale = (await repository.findById(inquiry.id.value))!;

    const toCustomer = (await repository.findById(inquiry.id.value))!;
    toCustomer.transitionTo("WAITING_FOR_CUSTOMER", new Date("2026-01-03T00:00:00.000Z"));
    await workflowRepository.changeStatus(toCustomer, {status:"WAITING_FOR_TEAM",updatedAt:new Date("2026-01-02T00:00:00.000Z")}, createStatusChangedWorkflowEvent(inquiry.id.value,"WAITING_FOR_TEAM","WAITING_FOR_CUSTOMER",null,new Date("2026-01-03T00:00:00.000Z")));
    const backToTeam = (await repository.findById(inquiry.id.value))!;
    backToTeam.transitionTo("WAITING_FOR_TEAM", new Date("2026-01-04T00:00:00.000Z"));
    await workflowRepository.changeStatus(backToTeam, {status:"WAITING_FOR_CUSTOMER",updatedAt:new Date("2026-01-03T00:00:00.000Z")}, createStatusChangedWorkflowEvent(inquiry.id.value,"WAITING_FOR_CUSTOMER","WAITING_FOR_TEAM",null,new Date("2026-01-04T00:00:00.000Z")));

    stale.transitionTo("CLOSED", new Date("2026-01-05T00:00:00.000Z"));
    await expect(workflowRepository.changeStatus(stale, {status:"WAITING_FOR_TEAM",updatedAt:new Date("2026-01-02T00:00:00.000Z")}, createStatusChangedWorkflowEvent(inquiry.id.value,"WAITING_FOR_TEAM","CLOSED",null,new Date("2026-01-05T00:00:00.000Z")))).resolves.toBe("conflict");
    expect((await repository.findById(inquiry.id.value))?.updatedAt).toEqual(new Date("2026-01-04T00:00:00.000Z"));
    expect(await workflowRepository.readHistory(inquiry.id.value)).toHaveLength(4);
  });

  it("conflicts a stale assignment after member-A ABA even when the member matches again", async () => {
    const inquiry = new InquiryTestBuilder().with({id:"assignment-aba"}).buildNew();
    await repository.save(inquiry);
    await pool.query("insert into inquiry_team_members (id,display_name,active,created_at,updated_at) values ('member-A','Member A',true,'2026-01-01','2026-01-01'),('member-B','Member B',true,'2026-01-01','2026-01-01'),('member-C','Member C',true,'2026-01-01','2026-01-01')");
    const initial = await workflowRepository.findAssignment(inquiry.id.value);
    initial.assignTo(TeamMember.reconstitute("member-A",true),new Date("2026-01-02T00:00:00.000Z"));
    await workflowRepository.changeAssignment(initial,{teamMemberId:null,changedAt:null},createAssignmentWorkflowEvent(inquiry.id.value,null,"member-A",null,new Date("2026-01-02T00:00:00.000Z")));
    const stale = await workflowRepository.findAssignment(inquiry.id.value);

    const toB = await workflowRepository.findAssignment(inquiry.id.value);
    toB.assignTo(TeamMember.reconstitute("member-B",true),new Date("2026-01-03T00:00:00.000Z"));
    await workflowRepository.changeAssignment(toB,{teamMemberId:"member-A",changedAt:new Date("2026-01-02T00:00:00.000Z")},createAssignmentWorkflowEvent(inquiry.id.value,"member-A","member-B",null,new Date("2026-01-03T00:00:00.000Z")));
    const backToA = await workflowRepository.findAssignment(inquiry.id.value);
    backToA.assignTo(TeamMember.reconstitute("member-A",true),new Date("2026-01-04T00:00:00.000Z"));
    await workflowRepository.changeAssignment(backToA,{teamMemberId:"member-B",changedAt:new Date("2026-01-03T00:00:00.000Z")},createAssignmentWorkflowEvent(inquiry.id.value,"member-B","member-A",null,new Date("2026-01-04T00:00:00.000Z")));

    stale.assignTo(TeamMember.reconstitute("member-C",true),new Date("2026-01-05T00:00:00.000Z"));
    await expect(workflowRepository.changeAssignment(stale,{teamMemberId:"member-A",changedAt:new Date("2026-01-02T00:00:00.000Z")},createAssignmentWorkflowEvent(inquiry.id.value,"member-A","member-C",null,new Date("2026-01-05T00:00:00.000Z")))).resolves.toBe("conflict");
    expect((await workflowRepository.findAssignment(inquiry.id.value)).changedAt).toEqual(new Date("2026-01-04T00:00:00.000Z"));
    expect(await workflowRepository.readHistory(inquiry.id.value)).toHaveLength(4);
  });

  it("allows only one concurrent first assignment and appends only its event", async () => {
    const inquiry = new InquiryTestBuilder().with({id:"assignment-first-conflict"}).buildNew();
    await repository.save(inquiry);
    await pool.query("insert into inquiry_team_members (id,display_name,active,created_at,updated_at) values ('member-A','Member A',true,'2026-01-01','2026-01-01'),('member-B','Member B',true,'2026-01-01','2026-01-01')");
    const first = await workflowRepository.findAssignment(inquiry.id.value);
    const second = await workflowRepository.findAssignment(inquiry.id.value);
    first.assignTo(TeamMember.reconstitute("member-A",true),new Date("2026-01-02T00:00:00.000Z"));
    second.assignTo(TeamMember.reconstitute("member-B",true),new Date("2026-01-02T00:00:01.000Z"));
    await expect(workflowRepository.changeAssignment(first,{teamMemberId:null,changedAt:null},createAssignmentWorkflowEvent(inquiry.id.value,null,"member-A",null,new Date("2026-01-02T00:00:00.000Z")))).resolves.toBe("changed");
    await expect(workflowRepository.changeAssignment(second,{teamMemberId:null,changedAt:null},createAssignmentWorkflowEvent(inquiry.id.value,null,"member-B",null,new Date("2026-01-02T00:00:01.000Z")))).resolves.toBe("conflict");
    expect((await workflowRepository.findAssignment(inquiry.id.value)).teamMemberId).toBe("member-A");
    expect(await workflowRepository.readHistory(inquiry.id.value)).toHaveLength(2);
  });

  it("rolls back a status update when its workflow event cannot be appended", async () => {
    const inquiry = new InquiryTestBuilder().with({id:"workflow-atomicity"}).buildNew();
    await repository.save(inquiry);
    const changed = (await repository.findById(inquiry.id.value))!;
    changed.transitionTo("WAITING_FOR_TEAM",new Date("2026-01-02T00:00:00.000Z"));
    const invalidEvent = {...createStatusChangedWorkflowEvent(inquiry.id.value,"NEW","WAITING_FOR_TEAM",null,new Date("2026-01-02T00:00:00.000Z")),actorReference:"x".repeat(161)};
    await expect(workflowRepository.changeStatus(changed,{status:"NEW",updatedAt:inquiry.updatedAt},invalidEvent)).rejects.toEqual(new InquiryPersistenceError());
    expect((await repository.findById(inquiry.id.value))?.status).toBe("NEW");
    expect(await workflowRepository.readHistory(inquiry.id.value)).toHaveLength(1);
  });

  it("saves and reconstitutes a complete Inquiry with exact instants", async () => {
    const inquiry = new InquiryTestBuilder().buildReconstituted({status: "QUOTED", updatedAt: new Date("2026-01-03T04:05:06.789Z")});
    await repository.save(inquiry);
    const restored = await repository.findById(inquiry.id.value);
    expect(restored).not.toBeNull();
    expect(restored?.status).toBe("QUOTED");
    expect(restored?.contact).toEqual(inquiry.contact);
    expect(restored?.privacy.acceptedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(restored?.updatedAt.toISOString()).toBe("2026-01-03T04:05:06.789Z");
  });

  it("preserves all historical persisted units during repository round trips", async () => {
    const items = (["pieces", "packages", "pallets", "truckloads"] as const).map((unit, index) => item(index + 1, unit));
    const inquiry = new InquiryTestBuilder().with({id: "ordered-inquiry", items}).buildReconstituted();
    await repository.save(inquiry);
    expect((await repository.findById(inquiry.id.value))?.items).toEqual(inquiry.items);
  });

  it("restores optional fields from null without inventing values", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "optional-inquiry", contact: {...inquiryFixture.contact, company: undefined, preferredMethods:["email"], telegramUsername: undefined}, location: {country: "TR"}, destination: undefined, message: undefined}).buildNew();
    await repository.save(inquiry);
    const restored = await repository.findById(inquiry.id.value);
    expect(restored?.contact.company).toBeUndefined();
    expect(restored?.contact.telegramUsername).toBeUndefined();
    expect(restored?.location.city).toBeUndefined();
    expect(restored?.destination).toBeUndefined();
    expect(restored?.message).toBeUndefined();
  });

  it.each([
    ["en", "English Customer", "London"], ["tr", "Türk Müşteri", "İstanbul"],
    ["fa", "مشتری فارسی", "تهران"], ["ar", "عميل عربي", "دبي"],
  ] as const)("round trips %s Unicode values", async (locale, fullName, city) => {
    const inquiry = new InquiryTestBuilder().with({id: `unicode-${locale}`, contact: {...inquiryFixture.contact, fullName}, location: {country:"TR", city}, source: {locale, path: `/${locale}/inquiry`}}).buildNew();
    await repository.save(inquiry);
    expect((await repository.findById(inquiry.id.value))?.contact.fullName).toBe(fullName);
    expect((await repository.findById(inquiry.id.value))?.location.city).toBe(city);
  });

  it("returns null for a missing Inquiry", async () => { expect(await repository.findById("missing-inquiry")).toBeNull(); });

  it("classifies connection failures without leaking connection details", async () => {
    const unavailablePool = createPostgresPool({connectionString: "postgresql://test_user:do-not-leak@127.0.0.1:1/yolpol_integration", connectionTimeoutMillis: 100});
    const unavailableRepository = new PostgresInquiryRepository(unavailablePool);
    try {
      await expect(unavailableRepository.findById("missing-inquiry")).rejects.toEqual(new InquiryPersistenceError());
    } finally {
      await unavailablePool.end();
    }
  });

  it("maps duplicate and concurrent duplicate IDs without overwriting", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "duplicate-inquiry"}).buildNew();
    await repository.save(inquiry);
    await expect(repository.save(inquiry)).rejects.toBeInstanceOf(DuplicateInquiryIdError);
    await cleanInquiryIntegrationTables();
    const results = await Promise.allSettled([repository.save(inquiry), repository.save(inquiry)]);
    expect(results.filter(({status}) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected" && result.reason instanceof DuplicateInquiryIdError)).toHaveLength(1);
  });

  it("rolls back the parent when a child constraint fails", async () => {
    await pool.query("alter table inquiry_items add constraint integration_reject_product check (product_id <> 'rollback-product')");
    try {
      const inquiry = new InquiryTestBuilder().with({id: "rollback-inquiry", items: [{...item(1, "pallets"), productId: "rollback-product"}]}).buildNew();
      await expect(repository.save(inquiry)).rejects.toBeInstanceOf(InquiryPersistenceError);
      expect((await pool.query("select id from inquiries where id = 'rollback-inquiry'")).rowCount).toBe(0);
      expect((await pool.query("select inquiry_id from inquiry_workflow_events where inquiry_id = 'rollback-inquiry'")).rowCount).toBe(0);
    } finally {
      await pool.query("alter table inquiry_items drop constraint integration_reject_product");
    }
  });

  it("enforces foreign-key, unique Product, closed-unit, and quantity constraints", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "constraint-inquiry"}).buildNew();
    await repository.save(inquiry);
    const values = ["constraint-inquiry", 1, "test-product-1", "TEST-SKU-1", "test-bottle", "Test Bottle", 1, "pieces"];
    await expect(pool.query("insert into inquiry_items (inquiry_id,position,product_id,sku,slug,product_name,quantity,unit) values ($1,$2,$3,$4,$5,$6,$7,$8)", values)).rejects.toMatchObject({code: "23505"});
    await expect(pool.query("insert into inquiry_items (inquiry_id,position,product_id,sku,slug,product_name,quantity,unit) values ('missing',0,'product-2','TEST-2','product-2','Product 2',1,'pieces')")).rejects.toMatchObject({code: "23503"});
    await expect(pool.query("update inquiry_items set unit = 'boxes' where inquiry_id = $1", [inquiry.id.value])).rejects.toMatchObject({code: "23514"});
    await expect(pool.query("update inquiry_items set quantity = 0 where inquiry_id = $1", [inquiry.id.value])).rejects.toMatchObject({code: "23514"});
  });

  it("fails safely when persisted primitives cannot be reconstituted", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "malformed-inquiry"}).buildNew();
    await repository.save(inquiry);
    await pool.query("update inquiries set source_path = 'https://invalid.example' where id = $1", [inquiry.id.value]);
    await expect(repository.findById(inquiry.id.value)).rejects.toEqual(new InquiryPersistenceError());
  });

  it("returns isolated aggregates on repeated queries", async () => {
    const inquiry = new InquiryTestBuilder().with({id: "isolated-inquiry"}).buildNew();
    await repository.save(inquiry);
    const first = await repository.findById(inquiry.id.value);
    first?.transitionTo("WAITING_FOR_TEAM", new Date("2026-01-02T00:00:00.000Z"));
    const second = await repository.findById(inquiry.id.value);
    expect(second?.status).toBe("NEW");
    expect(second?.items).not.toBe(first?.items);
  });
});
