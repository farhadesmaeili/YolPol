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
} as const;

describe("Staff authentication migration", () => {
  it("adds only constrained account and opaque-session persistence", async () => {
    const migration = await readFile("drizzle/0007_staff_authentication.sql", "utf8");
    expect(migration).toContain('CREATE TABLE "staff_accounts"');
    expect(migration).toContain('CREATE TABLE "staff_sessions"');
    expect(migration).toContain('CREATE UNIQUE INDEX "staff_accounts_team_member_uidx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "staff_accounts_normalized_email_uidx"');
    expect(migration).toContain('REFERENCES "public"."inquiry_team_members"("id") ON DELETE restrict');
    expect(migration).toContain('"staff_accounts_role_check" CHECK ("staff_accounts"."role" in (\'ADMIN\',\'SALES\'))');
    expect(migration).toContain('"staff_sessions_expiration_check" CHECK ("staff_sessions"."expires_at" > "staff_sessions"."created_at")');
    expect(migration).toContain('REFERENCES "public"."staff_accounts"("id") ON DELETE restrict');
    expect(migration).not.toMatch(/raw_token|session_token|credential|plaintext|internal.*price/iu);
    expect(migration).not.toMatch(/communication_recipients/iu);
  });

  it("leaves every previous migration byte-for-byte unchanged", async () => {
    for (const [fileName, expectedHash] of Object.entries(historicalMigrationHashes)) {
      const contents = await readFile(`drizzle/${fileName}`);
      expect(createHash("sha256").update(contents).digest("hex"), fileName).toBe(expectedHash);
    }
  });
});

