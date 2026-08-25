import {resolve} from "node:path";
import {readFile} from "node:fs/promises";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

import {DuplicateInquiryIdError} from "@/features/inquiries/application/ports/inquiry-ports";
import type {InquiryItemInput} from "@/features/inquiries/domain/types/inquiry-types";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {InquiryPersistenceError} from "@/features/inquiries/infrastructure/errors/inquiry-persistence-error";
import {PostgresInquiryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-repository";
import {PostgresConversationAccessRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-access-repository";
import {NodeConversationAccessTokenService} from "@/features/inquiries/infrastructure/security/conversation-access-token-service";
import {inquiryPostgresSchema} from "@/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema";
import {InquiryTestBuilder} from "@/features/inquiries/testing/builders/inquiry-test-builder";
import {inquiryFixture} from "@/features/inquiries/testing/fixtures/inquiry-fixtures";
import {safeIntegrationPoolConfig} from "@/features/inquiries/testing/integration/postgres-test-database";
import {createInquiryRequestHandler} from "@/features/inquiries/infrastructure/http/inquiry-request-handler";
import {createInquirySubmission} from "@/composition/inquiries/inquiry-submission";
import {deleteExpiredInquiries, inquiryRetentionCutoff} from "../../../../../tooling/retention/delete-expired-inquiries.mjs";

let pool: Pool;
let repository: PostgresInquiryRepository;

const item = (position: number, unit: InquiryItemInput["unit"]): InquiryItemInput => ({
  productId: `test-product-${position}`,
  sku: `TEST-SKU-${position}`,
  slug: `test-product-${position}`,
  productName: `Test Product ${position}`,
  quantity: position * 10,
  unit,
});

beforeAll(async () => {
  pool = createPostgresPool(safeIntegrationPoolConfig(process.env.INTEGRATION_DATABASE_URL));
  await migrate(drizzle(pool, {schema: inquiryPostgresSchema}), {migrationsFolder: resolve("drizzle")});
  repository = new PostgresInquiryRepository(pool);
});

beforeEach(async () => {
  const identity = await pool.query<{current_database: string; current_user: string}>("select current_database(), current_user");
  expect(identity.rows[0]).toEqual({current_database: "yolpol_integration", current_user: "yolpol_test"});
  await pool.query("truncate table conversation_access, conversation_messages, conversations, inquiry_outbox, inquiry_items, inquiries");
});

afterEach(async () => { vi.unstubAllEnvs(); await pool.query("truncate table conversation_access, conversation_messages, conversations, inquiry_outbox, inquiry_items, inquiries"); });

afterAll(async () => { if (pool) await pool.end(); });

describe("PostgresInquiryRepository", () => {
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
    const responseBody=await response.json() as {status:string;inquiryId:string;conversationAccessToken:string};
    expect(responseBody).toMatchObject({status:"created",inquiryId:expect.any(String),conversationAccessToken:expect.stringMatching(/^ypc_[A-Za-z0-9_-]{43}$/u)});
    const roots=await pool.query<{id:string}>("select id from inquiries"); expect(roots.rowCount).toBe(1);
    const conversations=await pool.query<{id:string;inquiry_id:string;channel:string}>("select id,inquiry_id,channel from conversations");
    expect(conversations.rows).toEqual([{id:roots.rows[0]?.id,inquiry_id:roots.rows[0]?.id,channel:"WEBSITE"}]);
    const accessRows=await pool.query<{conversation_id:string;token_lookup:string;token_hash:string}>("select conversation_id,token_lookup,token_hash from conversation_access");
    expect(accessRows.rows).toEqual([{conversation_id:roots.rows[0]?.id,token_lookup:expect.stringMatching(/^[a-f0-9]{64}$/u),token_hash:expect.stringMatching(/^[a-f0-9]{64}$/u)}]);
    expect(JSON.stringify(accessRows.rows)).not.toContain(responseBody.conversationAccessToken);
    const presented=new NodeConversationAccessTokenService().inspect(responseBody.conversationAccessToken)!;
    expect((await new PostgresConversationAccessRepository(pool).findByLookup(presented.lookup))?.inquiryId).toBe(roots.rows[0]?.id);
    expect((await pool.query("select id from conversation_messages")).rowCount).toBe(0);
    const events=await pool.query<{event_type:string;aggregate_id:string;payload:{inquiryId:string;occurredAt:string};attempts:number;processed_at:Date|null}>("select event_type,aggregate_id,payload,attempts,processed_at from inquiry_outbox");
    expect(events.rows).toEqual([{event_type:"InquiryCreated",aggregate_id:roots.rows[0]?.id,payload:{inquiryId:roots.rows[0]?.id,occurredAt:expect.any(String)},attempts:0,processed_at:null}]);
    expect(JSON.stringify(events.rows[0]?.payload)).not.toMatch(/price|secret|credential|token|api.?key/i);
    const rows=await pool.query<{position:number;product_id:string;sku:string;slug:string;product_name:string;quantity:number;unit:string}>("select position,product_id,sku,slug,product_name,quantity,unit from inquiry_items order by position");
    expect(rows.rows).toEqual([
      {position:0,product_id:"ylp-gb-250-og-rd",sku:"YLP-GB-250-OG-RD",slug:"250ml-olive-green-round-glass-bottle",product_name:"250ml Olive Green Round Glass Bottle",quantity:27,unit:"pallets"},
      {position:1,product_id:"ylp-gb-250-cl-rd",sku:"YLP-GB-250-CL-RD",slug:"250ml-clear-round-glass-bottle",product_name:"250ml Clear Round Glass Bottle",quantity:25,unit:"pallets"},
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
    const result = await pool.query<{table_name: string}>("select table_name from information_schema.tables where table_schema = 'public' and table_name in ('conversation_access','conversation_messages','conversations','inquiries','inquiry_items','inquiry_outbox') order by table_name");
    expect(result.rows.map(({table_name}) => table_name)).toEqual(["conversation_access", "conversation_messages", "conversations", "inquiries", "inquiry_items", "inquiry_outbox"]);
    const migrations = await pool.query<{count: string}>("select count(*) from drizzle.__drizzle_migrations");
    expect(migrations.rows[0]?.count).toBe("5");
  });

  it("saves and reconstitutes a complete Inquiry with exact instants", async () => {
    const inquiry = new InquiryTestBuilder().buildReconstituted({status: "quoted", updatedAt: new Date("2026-01-03T04:05:06.789Z")});
    await repository.save(inquiry);
    const restored = await repository.findById(inquiry.id.value);
    expect(restored).not.toBeNull();
    expect(restored?.status).toBe("quoted");
    expect(restored?.contact).toEqual(inquiry.contact);
    expect(restored?.privacy.acceptedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(restored?.updatedAt.toISOString()).toBe("2026-01-03T04:05:06.789Z");
  });

  it("preserves legacy persisted units while new submissions remain pallet-only", async () => {
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
    await pool.query("truncate table conversation_access, conversation_messages, conversations, inquiry_outbox, inquiry_items, inquiries");
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
    first?.transitionTo("processing", new Date("2026-01-02T00:00:00.000Z"));
    const second = await repository.findById(inquiry.id.value);
    expect(second?.status).toBe("received");
    expect(second?.items).not.toBe(first?.items);
  });
});
