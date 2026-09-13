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
  "0009_robust_unus.sql": "22c6e9bd25d45c97fbcb26f0d32f8d1da44c4fbf3bc8c69a22aa762e65110301",
  "0010_customer_conversation_message_created.sql": "c73bd53a9679b5d45aa193c2e039cb94b49a697fcda515c9b018526fd2e69ddd",
} as const;

describe("Staff roles and Team Management migrations", () => {
  it("expands only the role constraint while preserving existing ADMIN and SALES values", async () => {
    const migration = await readFile("drizzle/0011_staff_role_expansion.sql", "utf8");
    expect(migration).toBe(
      'ALTER TABLE "staff_accounts" DROP CONSTRAINT "staff_accounts_role_check";--> statement-breakpoint\n'
      + 'ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_role_check" CHECK ("staff_accounts"."role" in (\'SUPER_ADMIN\',\'ADMIN\',\'SALES\',\'VIEWER\'));',
    );
    expect(migration).not.toMatch(/UPDATE|INSERT|DELETE|TRUNCATE|TYPE\s+.*enum/iu);
  });

  it("creates constrained digest-only one-time Staff invitations", async () => {
    const migration = await readFile("drizzle/0012_staff_invitations.sql", "utf8");
    expect(migration).toContain('CREATE TABLE "staff_invitations"');
    expect(migration).toContain('"target_role" varchar(16) NOT NULL');
    expect(migration).toContain('CHECK ("staff_invitations"."target_role" in (\'ADMIN\',\'SALES\',\'VIEWER\'))');
    expect(migration).toContain('REFERENCES "public"."staff_accounts"("id") ON DELETE restrict');
    expect(migration).toContain('CREATE UNIQUE INDEX "staff_invitations_token_lookup_uidx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "staff_invitations_outstanding_email_uidx"');
    expect(migration).toContain('CREATE INDEX "staff_invitations_expiry_idx"');
    expect(migration).toContain('"staff_invitations_terminal_state_check"');
    expect(migration).not.toMatch(/raw|credential|password|plaintext|token_value|secret/iu);
    expect(migration).not.toMatch(/(?:^|\n)\s*(?:UPDATE|INSERT INTO|DELETE FROM|TRUNCATE)\s/iu);
  });

  it("leaves every prior migration byte-for-byte unchanged", async () => {
    for (const [fileName, expectedHash] of Object.entries(historicalMigrationHashes)) {
      const contents = await readFile(`drizzle/${fileName}`);
      expect(createHash("sha256").update(contents).digest("hex"), fileName).toBe(expectedHash);
    }
  });
});
