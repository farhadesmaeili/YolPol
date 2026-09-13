import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {describe, expect, it} from "vitest";

const historicalMigrationHashes = {
  "0000_hot_lorna_dane.sql": "8ed761df6bc38c1ade02d6d9521dcef8d7d986ee89ca8dd5779fcd269cff4fb0",
  "0001_fast_wild_child.sql": "3d2cd07302299192f47f4077d5f2a0f97d77be5a6ad78d3fa0ec93ca46c9468e",
  "0002_blushing_deathstrike.sql": "fa1b9c3e52ac7c2774962f92f3dc147b286c4ebb73765772494b5c41273b2d88",
  "0003_bitter_norrin_radd.sql": "76b86d0e0400784f78262e4c3b5541dcceb0fc4e3f82a57af9b6f4515f588684",
  "0004_telegram_communication_recipients.sql": "629acb1d9236c8de502eb4ef31d554a602607266bbe214e134be11e429fee93f",
  "0005_customer_conversation_access.sql": "83739c8d6f0168f050e7fb405bd3f3bfcb18ee95cd7898eccf4ce13403387c01",
  "0006_hesitant_cyclops.sql": "c462cb852f728bd72cc4a53be68fc2c947dbeb2869a09bff81f319253cc837e6",
  "0007_staff_authentication.sql": "959c8e6ae4c5f201923148f520e9af39c3e89b8105cb132d4ddd45cf479cdc22",
  "0008_small_payback.sql": "6012040d39170454b003781a64b585ff785240828e1b32692f5d5b7a520d5993",
} as const;

describe("Telegram real-integration migration", () => {
  it("adds a durable per-recipient delivery ledger and optional recipient-to-team-member mapping", async () => {
    const migration = await readFile("drizzle/0009_robust_unus.sql", "utf8");

    expect(migration).toContain('CREATE TABLE "telegram_inquiry_deliveries"');
    expect(migration).toContain('PRIMARY KEY("outbox_event_id","recipient_id")');
    expect(migration).toContain('ADD COLUMN "team_member_id" varchar(128)');
    expect(migration).not.toMatch(/ADD COLUMN "team_member_id"[^;]*NOT NULL/iu);
    expect(migration).toContain('ON DELETE cascade');
    expect(migration).toContain('ON DELETE restrict');
    expect(migration).toContain('WHERE "telegram_inquiry_deliveries"."telegram_chat_id" is not null and "telegram_inquiry_deliveries"."telegram_message_id" is not null');
    expect(migration).toContain('"communication_recipients_team_member_kind_check"');
    expect(migration).not.toMatch(/TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|bot\d+:/u);
    expect(migration).not.toMatch(/(?:UPDATE|INSERT INTO|DELETE FROM|TRUNCATE) "?communication_recipients/u);
  });

  it("leaves every previous migration byte-for-byte unchanged", async () => {
    for (const [fileName, expectedHash] of Object.entries(historicalMigrationHashes)) {
      const contents = await readFile(`drizzle/${fileName}`);
      expect(createHash("sha256").update(contents).digest("hex"), fileName).toBe(expectedHash);
    }
  });

  it("only broadens the Inquiry outbox event-type constraint for customer messages", async () => {
    const priorTelegramMigration = await readFile("drizzle/0009_robust_unus.sql");
    const migration = await readFile("drizzle/0010_customer_conversation_message_created.sql", "utf8");

    expect(createHash("sha256").update(priorTelegramMigration).digest("hex")).toBe("22c6e9bd25d45c97fbcb26f0d32f8d1da44c4fbf3bc8c69a22aa762e65110301");
    expect(migration).toBe(
      'ALTER TABLE "inquiry_outbox" DROP CONSTRAINT "inquiry_outbox_event_type_check";--> statement-breakpoint\n'
      + 'ALTER TABLE "inquiry_outbox" ADD CONSTRAINT "inquiry_outbox_event_type_check" CHECK ("inquiry_outbox"."event_type" in (\'InquiryCreated\',\'CustomerConversationMessageCreated\'));',
    );
    expect(migration).not.toMatch(/(?:CREATE|DROP) TABLE|ADD COLUMN|DROP COLUMN|CREATE INDEX|(?:UPDATE|INSERT INTO|DELETE FROM|TRUNCATE)\s/iu);
    expect(migration).not.toContain("telegram_inquiry_deliveries");
  });
});
