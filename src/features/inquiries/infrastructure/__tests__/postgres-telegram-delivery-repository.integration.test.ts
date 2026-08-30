import {resolve} from "node:path";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";

import {toConversationMessageDto} from "@/features/inquiries/application/mappers/conversation-message-dto-mapper";
import {ReadNewConversationMessages} from "@/features/inquiries/application/use-cases/read-new-conversation-messages";
import {ReceiveTelegramReply} from "@/features/inquiries/application/use-cases/receive-telegram-reply";
import {Conversation} from "@/features/inquiries/domain/entities/conversation";
import {createInquiryCreated} from "@/features/inquiries/domain/events/inquiry-created";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresConversationMessageRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository";
import {PostgresInquiryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-repository";
import {PostgresTelegramDeliveryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-telegram-delivery-repository";
import {inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {ResolveTelegramStaffActor} from "@/features/telegram-staff-onboarding/application/use-cases/resolve-telegram-staff-actor";
import {PostgresTelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/infrastructure/persistence/postgres/repositories/postgres-telegram-staff-onboarding-repository";

let pool: Pool;
let inquiryRepository: PostgresInquiryRepository;
let deliveryRepository: PostgresTelegramDeliveryRepository;
let messageRepository: PostgresConversationMessageRepository;

const now = new Date("2026-08-26T10:00:00.000Z");

async function cleanTables() {
  await pool.query("truncate table telegram_connection_requests, telegram_staff_links, staff_sessions, staff_invitations, staff_accounts, telegram_inquiry_deliveries, communication_recipients, conversation_access, conversation_messages, inquiry_assignments, inquiry_workflow_events, conversations, inquiry_outbox, inquiry_items, inquiry_team_members, inquiries");
}

async function seedInquiry(id: string) {
  const inquiry = new InquiryTestBuilder().with({id, createdAt: now}).buildNew();
  const conversation = Conversation.start({id: `${id}-conversation`, inquiryId: id, channel: "WEBSITE", createdAt: now});
  const event = createInquiryCreated(id, now);
  await inquiryRepository.save(inquiry, event, conversation);
  return {inquiry, conversation, event};
}

async function seedRecipients() {
  await pool.query("insert into inquiry_team_members (id,display_name,active,created_at,updated_at) values ('member-a','Member A',true,$1,$1),('member-b','Member B',true,$1,$1)", [now]);
  await pool.query(`
    insert into communication_recipients (id,channel,kind,external_id,display_name,team_member_id,authorized,notifications_enabled,created_at,updated_at)
    values
      ('telegram-group','TELEGRAM','TEAM_GROUP','-100900','Operations group',null,true,true,$1,$1),
      ('telegram-member-a','TELEGRAM','TEAM_MEMBER','101','Member A','member-a',true,true,$1,$1),
      ('telegram-member-b','TELEGRAM','TEAM_MEMBER','102','Member B','member-b',true,true,$1,$1),
      ('telegram-disabled','TELEGRAM','TEAM_MEMBER','103','Disabled',null,true,false,$1,$1),
      ('telegram-unauthorized','TELEGRAM','TEAM_MEMBER','104','Unauthorized',null,false,true,$1,$1),
      ('email-member','EMAIL','TEAM_MEMBER','member@example.test','Email member',null,true,true,$1,$1)
  `, [now]);
}

beforeAll(async () => {
  pool = createPostgresPool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: inquiryPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  inquiryRepository = new PostgresInquiryRepository(pool);
  deliveryRepository = new PostgresTelegramDeliveryRepository(pool);
  messageRepository = new PostgresConversationMessageRepository(pool);
});

beforeEach(async () => {
  const identity = await pool.query<{current_database: string; current_user: string}>("select current_database(), current_user");
  expect(identity.rows[0]).toEqual({current_database: "yolpol_integration", current_user: "yolpol_test"});
  await cleanTables();
});

afterEach(cleanTables);
afterAll(async () => { if (pool) await pool.end(); });

describe("PostgresTelegramDeliveryRepository", () => {
  it("freezes the eligible recipient set, retries only a failed recipient, and correlates an inbound reply", async () => {
    const {inquiry, conversation, event} = await seedInquiry("telegram-ledger-integration");
    await seedRecipients();

    await expect(deliveryRepository.snapshotRecipients({outboxEventId: event.eventId, conversationId: conversation.id.value, now})).resolves.toBe(3);
    await pool.query("update communication_recipients set external_id='-100999',authorized=false,notifications_enabled=false,updated_at=$1 where id='telegram-group'", [new Date(now.getTime() + 1_000)]);
    await pool.query("insert into communication_recipients (id,channel,kind,external_id,display_name,authorized,notifications_enabled,created_at,updated_at) values ('telegram-late','TELEGRAM','TEAM_MEMBER','105','Late member',true,true,$1,$1)", [now]);
    await expect(deliveryRepository.snapshotRecipients({outboxEventId: event.eventId, conversationId: conversation.id.value, now})).resolves.toBe(3);
    const future = await seedInquiry("telegram-future-snapshot");
    await expect(deliveryRepository.snapshotRecipients({outboxEventId: future.event.eventId, conversationId: future.conversation.id.value, now})).resolves.toBe(3);
    const futureRecipients = await pool.query<{recipient_id: string}>("select recipient_id from telegram_inquiry_deliveries where outbox_event_id=$1 order by recipient_id", [future.event.eventId]);
    expect(futureRecipients.rows).toEqual([{recipient_id: "telegram-late"}, {recipient_id: "telegram-member-a"}, {recipient_id: "telegram-member-b"}]);

    const claimed = await deliveryRepository.claimDue({outboxEventId: event.eventId, limit: 100, now});
    expect(claimed.map(({recipientId, recipientExternalId, attempts}) => ({recipientId, recipientExternalId, attempts}))).toEqual([
      {recipientId: "telegram-group", recipientExternalId: "-100900", attempts: 1},
      {recipientId: "telegram-member-a", recipientExternalId: "101", attempts: 1},
      {recipientId: "telegram-member-b", recipientExternalId: "102", attempts: 1},
    ]);

    const [group, memberA, memberB] = claimed;
    expect(group && memberA && memberB).toBeTruthy();
    await deliveryRepository.markDelivered({delivery: group!, telegramChatId: -100900, telegramMessageId: 7001, deliveredAt: now});
    await deliveryRepository.markDelivered({delivery: memberA!, telegramChatId: 101, telegramMessageId: 7002, deliveredAt: now});
    const retryAt = new Date(now.getTime() + 30_000);
    await deliveryRepository.markRetryable({delivery: memberB!, errorCode: "TELEGRAM_SERVER_ERROR", availableAt: retryAt, updatedAt: now});

    await expect(deliveryRepository.summarizeEvent(event.eventId)).resolves.toEqual({
      total: 3,
      automaticWorkRemaining: 1,
      nextAutomaticWorkAt: retryAt,
      delivered: 2,
      permanentFailures: 0,
      unknown: 0,
    });
    await expect(deliveryRepository.claimDue({outboxEventId: event.eventId, limit: 100, now})).resolves.toEqual([]);
    const retry = await deliveryRepository.claimDue({outboxEventId: event.eventId, limit: 100, now: retryAt});
    expect(retry).toHaveLength(1);
    expect(retry[0]).toMatchObject({recipientId: "telegram-member-b", recipientExternalId: "102", attempts: 2});
    await deliveryRepository.markDelivered({delivery: retry[0]!, telegramChatId: 102, telegramMessageId: 7003, deliveredAt: retryAt});
    await expect(deliveryRepository.summarizeEvent(event.eventId)).resolves.toMatchObject({automaticWorkRemaining: 0, delivered: 3});

    await pool.query("insert into staff_accounts (id,team_member_id,normalized_email,password_hash,role,active,created_at,updated_at) values ('account-a','member-a','member-a@example.test','stored-hash','SALES',true,$1,$1),('account-b','member-b','member-b@example.test','stored-hash','SALES',true,$1,$1)", [now]);
    await pool.query("insert into telegram_staff_links (id,team_member_id,telegram_user_id,private_chat_id,first_linked_at,connected_at,updated_at) values ('link-a','member-a',101,101,$1,$1,$1)", [now]);

    const receive = new ReceiveTelegramReply(
      new ResolveTelegramStaffActor(new PostgresTelegramStaffOnboardingRepository(pool), new StaffAuthorizationPolicy()),
      deliveryRepository,
      messageRepository,
      {now: () => new Date(now.getTime() + 60_000)},
    );
    const incoming = {
      externalUpdateId: "9001",
      externalMessageId: "-100900:8001",
      externalRecipientId: "-100900",
      senderExternalId: "101",
      repliedMessageId: "7001",
      body: "Production is available for this request.",
    } as const;
    await expect(receive.execute({...incoming, externalUpdateId: "8999", senderExternalId: "-100999"})).resolves.toEqual({status: "unauthorized"});
    await expect(receive.execute({...incoming, externalUpdateId: "8998", senderExternalId: "102"})).resolves.toEqual({status: "unauthorized"});
    await expect(receive.execute({...incoming, externalUpdateId: "9000", repliedMessageId: "7999"})).resolves.toEqual({status: "conversation_not_found"});
    await expect(receive.execute(incoming)).resolves.toEqual({status: "created"});
    await expect(receive.execute(incoming)).resolves.toEqual({status: "duplicate"});

    const privateIncoming = {...incoming, externalUpdateId: "9002", externalMessageId: "101:8002", externalRecipientId: "101", repliedMessageId: "7002", body: "Private follow-up from the mapped member."} as const;
    await expect(receive.execute(privateIncoming)).resolves.toEqual({status: "created"});
    await pool.query("update staff_accounts set role='VIEWER',updated_at=$1 where id='account-a'", [new Date(now.getTime() + 20_000)]);
    await expect(receive.execute({...privateIncoming, externalUpdateId: "90025"})).resolves.toEqual({status: "unauthorized"});
    await pool.query("update staff_accounts set role='SALES',updated_at=$1 where id='account-a'", [new Date(now.getTime() + 25_000)]);
    await pool.query("update inquiry_team_members set active=false,updated_at=$1 where id='member-a'", [new Date(now.getTime() + 30_000)]);
    const inactiveMappedIncoming = {...privateIncoming, externalUpdateId: "9003", externalMessageId: "101:8003", body: "Authorized identity after operational deactivation."} as const;
    await expect(receive.execute(inactiveMappedIncoming)).resolves.toEqual({status: "unauthorized"});

    const storedActors = await pool.query<{actor_reference: string | null}>("select actor_reference from conversation_messages order by position");
    expect(storedActors.rows).toEqual([{actor_reference: "staff:member-a"}, {actor_reference: "staff:member-a"}]);

    const customerUpdates = await new ReadNewConversationMessages(messageRepository, toConversationMessageDto).execute({inquiryId: inquiry.id.value, afterCursor: -1});
    expect(customerUpdates).toMatchObject({status: "found", updates: [
      {cursor: 0, message: {senderType: "INTERNAL_USER", channel: "TELEGRAM", body: incoming.body}},
      {cursor: 1, message: {senderType: "INTERNAL_USER", channel: "TELEGRAM", body: privateIncoming.body}},
    ]});
    expect(JSON.stringify(customerUpdates)).not.toMatch(/actorReference|staff:member-a|telegram-member-a|7001|-100900/u);
  });

  it("keeps permanent, ambiguous, and expired in-flight outcomes terminal", async () => {
    const {conversation, event} = await seedInquiry("telegram-terminal-integration");
    await seedRecipients();
    await deliveryRepository.snapshotRecipients({outboxEventId: event.eventId, conversationId: conversation.id.value, now});
    const claimed = await deliveryRepository.claimDue({outboxEventId: event.eventId, limit: 2, now});
    await deliveryRepository.markPermanentFailure({delivery: claimed[0]!, errorCode: "RECIPIENT_FORBIDDEN", updatedAt: now});
    await deliveryRepository.markUnknown({delivery: claimed[1]!, errorCode: "NETWORK_OUTCOME_UNKNOWN", updatedAt: now});

    const later = new Date(now.getTime() + 120_000);
    const remaining = await deliveryRepository.claimDue({outboxEventId: event.eventId, limit: 1, now});
    expect(remaining).toHaveLength(1);
    await pool.query("update telegram_inquiry_deliveries set locked_until=$1 where outbox_event_id=$2 and recipient_id=$3", [new Date(now.getTime() - 1), event.eventId, remaining[0]!.recipientId]);
    await expect(deliveryRepository.claimDue({outboxEventId: event.eventId, limit: 100, now: later})).resolves.toEqual([]);
    await expect(deliveryRepository.summarizeEvent(event.eventId)).resolves.toEqual({
      total: 3,
      automaticWorkRemaining: 0,
      nextAutomaticWorkAt: null,
      delivered: 0,
      permanentFailures: 1,
      unknown: 2,
    });
    const rows = await pool.query<{status: string; last_error_code: string | null}>("select status,last_error_code from telegram_inquiry_deliveries order by recipient_id");
    expect(rows.rows).toEqual([
      {status: "PERMANENT_FAILURE", last_error_code: "RECIPIENT_FORBIDDEN"},
      {status: "UNKNOWN", last_error_code: "NETWORK_OUTCOME_UNKNOWN"},
      {status: "UNKNOWN", last_error_code: "WORKER_OUTCOME_UNKNOWN"},
    ]);
  });

  it("leases a due row once and keeps provider bindings isolated by event and conversation", async () => {
    const first = await seedInquiry("telegram-correlation-first");
    const second = await seedInquiry("telegram-correlation-second");
    await seedRecipients();
    await deliveryRepository.snapshotRecipients({outboxEventId: first.event.eventId, conversationId: first.conversation.id.value, now});
    await deliveryRepository.snapshotRecipients({outboxEventId: second.event.eventId, conversationId: second.conversation.id.value, now});

    const [firstClaim] = await deliveryRepository.claimDue({outboxEventId: first.event.eventId, limit: 1, now});
    expect(firstClaim).toMatchObject({recipientId: "telegram-group", attempts: 1});
    const followingClaims = await deliveryRepository.claimDue({outboxEventId: first.event.eventId, limit: 100, now});
    expect(followingClaims.map(({recipientId}) => recipientId)).toEqual(["telegram-member-a", "telegram-member-b"]);
    expect(followingClaims).not.toContainEqual(expect.objectContaining({recipientId: firstClaim!.recipientId}));

    await deliveryRepository.markDelivered({delivery: firstClaim!, telegramChatId: -100900, telegramMessageId: 8101, deliveredAt: now});
    const [secondClaim] = await deliveryRepository.claimDue({outboxEventId: second.event.eventId, limit: 1, now});
    await deliveryRepository.markDelivered({delivery: secondClaim!, telegramChatId: -100900, telegramMessageId: 8102, deliveredAt: now});

    await expect(deliveryRepository.findConversationByProviderMessage({telegramChatId: -100900, telegramMessageId: 8101})).resolves.toEqual({conversationId: first.conversation.id.value});
    await expect(deliveryRepository.findConversationByProviderMessage({telegramChatId: -100900, telegramMessageId: 8102})).resolves.toEqual({conversationId: second.conversation.id.value});
    await expect(deliveryRepository.findConversationByProviderMessage({telegramChatId: 8101, telegramMessageId: -100900})).resolves.toBeNull();
    await expect(pool.query("delete from communication_recipients where id='telegram-group'")).rejects.toThrow();
  });

  it("round-trips the documented 52-bit Telegram chat identifier without precision loss", async () => {
    const maximumTelegramId = 2 ** 52 - 1;
    const {conversation, event} = await seedInquiry("telegram-large-id");
    await seedRecipients();
    await deliveryRepository.snapshotRecipients({outboxEventId: event.eventId, conversationId: conversation.id.value, now});
    const [delivery] = await deliveryRepository.claimDue({outboxEventId: event.eventId, limit: 1, now});
    await deliveryRepository.markDelivered({delivery: delivery!, telegramChatId: -maximumTelegramId, telegramMessageId: 2_147_483_647, deliveredAt: now});

    await expect(deliveryRepository.findConversationByProviderMessage({telegramChatId: -maximumTelegramId, telegramMessageId: 2_147_483_647})).resolves.toEqual({conversationId: conversation.id.value});
    const stored = await pool.query<{telegram_chat_id: string; telegram_message_id: string}>("select telegram_chat_id,telegram_message_id from telegram_inquiry_deliveries where outbox_event_id=$1 and recipient_id=$2", [event.eventId, delivery!.recipientId]);
    expect(stored.rows).toEqual([{telegram_chat_id: String(-maximumTelegramId), telegram_message_id: "2147483647"}]);
  });
});
