import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {getTableConfig, PgDialect} from "drizzle-orm/pg-core";
import {conversationChannelPostgresSchema} from "@/features/conversation-channels/infrastructure/persistence/postgres/schema/conversation-channel-schema";

describe("Conversation Channel migration", () => {
  const sql = readFileSync("drizzle/0020_conversation_channel_foundation.sql", "utf8");

  it("adds bindings, inbound dedupe, and outbound delivery persistence", () => {
    expect(sql).toContain('CREATE TABLE "conversation_channel_bindings"');
    expect(sql).toContain('CREATE TABLE "conversation_channel_inbound_messages"');
    expect(sql).toContain('CREATE TABLE "conversation_channel_deliveries"');
    expect(sql).toContain("conversation_channel_bindings_external_conversation_uidx");
    expect(sql).toContain("conversation_channel_inbound_external_message_uidx");
    expect(sql).toContain("conversation_channel_deliveries_message_binding_uidx");
    expect(sql).toContain("conversation_channel_deliveries_due_idx");
    expect(sql.indexOf('CREATE UNIQUE INDEX "conversation_messages_id_conversation_uidx"'))
      .toBeLessThan(sql.indexOf('ADD CONSTRAINT "conversation_channel_deliveries_message_fk"'));
  });

  it("stores normalized text and opaque references without payload or secret bags", () => {
    const normalized = sql.toLowerCase();
    for (const forbidden of ["raw_payload", "webhook_payload", "provider_token", "access_token", "api_key", "jsonb", "internal_unit_price", "supplier_cost", "margin"]) {
      expect(normalized).not.toContain(forbidden);
    }
  });

  it("keeps every channel check aligned across Drizzle, snapshot, and migration", () => {
    const snapshot = JSON.parse(readFileSync("drizzle/meta/0020_snapshot.json", "utf8"));
    const previous = JSON.parse(readFileSync("drizzle/meta/0019_snapshot.json", "utf8"));
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    expect(snapshot.prevId).toBe(previous.id);
    expect(journal.entries.find((entry: {idx: number}) => entry.idx === 20)).toMatchObject({idx: 20, tag: "0020_conversation_channel_foundation"});
    const dialect = new PgDialect();
    for (const table of Object.values(conversationChannelPostgresSchema)) {
      const config = getTableConfig(table);
      for (const constraint of config.checks) {
        const expression = dialect.sqlToQuery(constraint.value).sql;
        expect(snapshot.tables[`public.${config.name}`].checkConstraints[constraint.name].value).toBe(expression);
        expect(sql).toContain(`CONSTRAINT "${constraint.name}" CHECK (${expression})`);
      }
    }
  });
});
