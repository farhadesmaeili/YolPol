import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {getTableConfig, PgDialect} from "drizzle-orm/pg-core";
import {conversationTranslationControls, conversationTranslationControlEvents, conversationTranslationEvents, globalTranslationSettingEvents, globalTranslationSettings} from "@/features/conversation-translation/infrastructure/persistence/translation-schema";

describe("Conversation Translation Control migration", () => {
  const sql = readFileSync("drizzle/0021_conversation_translation_control.sql", "utf8");

  it("adds constrained per-Conversation controls with backward-compatible automatic defaults", () => {
    expect(sql).toContain('CREATE TABLE "conversation_translation_controls"');
    expect(sql).toContain('CREATE TABLE "conversation_translation_control_events"');
    expect(sql).toContain('"customer_to_staff_mode" varchar(16) DEFAULT \'AUTO\' NOT NULL');
    expect(sql).toContain('"staff_to_customer_mode" varchar(16) DEFAULT \'AUTO\' NOT NULL');
    expect(sql).toContain('"ai_to_staff_mode" varchar(16) DEFAULT \'AUTO\' NOT NULL');
    expect(sql).toContain("in ('AUTO','MANUAL')");
    expect(sql).toContain("in ('AUTO','ON_DEMAND')");
    expect(sql).toContain("translation_control_events_append_only_trigger");
  });

  it("adds only metadata and the explicit idempotent translation request action", () => {
    expect(sql).toContain("in ('REQUEST','RETRY','SKIP','CONFIRM_LANGUAGE')");
    for (const forbidden of ["message_body", "translated_body", "provider", "model", "credential", "api_key", "price", "cost", "margin"]) {
      expect(sql.toLowerCase()).not.toContain(`"${forbidden}"`);
    }
  });

  it("keeps the generated snapshot and migration journal linked after Conversation Channel Foundation", () => {
    const snapshot = JSON.parse(readFileSync("drizzle/meta/0021_snapshot.json", "utf8"));
    const previous = JSON.parse(readFileSync("drizzle/meta/0020_snapshot.json", "utf8"));
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    expect(snapshot.prevId).toBe(previous.id);
    expect(journal.entries[21]).toMatchObject({idx: 21, tag: "0021_conversation_translation_control"});
    expect(snapshot.tables["public.conversation_translation_controls"]).toBeDefined();
    expect(snapshot.tables["public.conversation_translation_control_events"]).toBeDefined();
    const dialect = new PgDialect();
    for (const table of [conversationTranslationControls, conversationTranslationEvents]) {
      const config = getTableConfig(table);
      for (const constraint of config.checks) {
        const expression = dialect.sqlToQuery(constraint.value).sql;
        expect(snapshot.tables[`public.${config.name}`].checkConstraints[constraint.name].value).toBe(expression);
        if (config.name !== "conversation_translation_events" || constraint.name === "translation_event_action_check") {
          expect(sql).toContain(`CONSTRAINT "${constraint.name}" CHECK (${expression})`);
        }
      }
    }
    for (const [name, table] of Object.entries(previous.tables)) {
      if (name !== "public.conversation_translation_events") expect(snapshot.tables[name]).toEqual(table);
    }
  });
});

describe("Global Translation Settings migration", () => {
  const sql = readFileSync("drizzle/0022_global_translation_settings.sql", "utf8");

  it("adds constrained singleton defaults, versioned events, and removable override audit semantics", () => {
    expect(sql).toContain('CREATE TABLE "global_translation_settings"');
    expect(sql).toContain('CREATE TABLE "global_translation_setting_events"');
    expect(sql).toContain('"ai_to_staff_mode" varchar(16) DEFAULT \'ON_DEMAND\' NOT NULL');
    expect(sql).toContain('"id" = \'GLOBAL\'');
    expect(sql).toContain('ADD COLUMN "operation" varchar(16) DEFAULT \'SET\' NOT NULL');
    expect(sql).toContain("global_translation_setting_events_append_only_trigger");
    for (const forbidden of ["message_body", "translated_body", "provider", "model", "credential", "api_key", "price", "cost", "margin"]) {
      expect(sql.toLowerCase()).not.toContain(`"${forbidden}"`);
    }
  });

  it("links the generated snapshot and journal without changing historical migration files", () => {
    const snapshot = JSON.parse(readFileSync("drizzle/meta/0022_snapshot.json", "utf8"));
    const previous = JSON.parse(readFileSync("drizzle/meta/0021_snapshot.json", "utf8"));
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    expect(snapshot.prevId).toBe(previous.id);
    expect(journal.entries.at(-1)).toMatchObject({idx: 22, tag: "0022_global_translation_settings"});
    const dialect = new PgDialect();
    for (const table of [globalTranslationSettings, globalTranslationSettingEvents, conversationTranslationControlEvents]) {
      const config = getTableConfig(table);
      expect(snapshot.tables[`public.${config.name}`]).toBeDefined();
      for (const constraint of config.checks) {
        const expression = dialect.sqlToQuery(constraint.value).sql;
        expect(snapshot.tables[`public.${config.name}`].checkConstraints[constraint.name].value).toBe(expression);
        if (config.name !== "conversation_translation_control_events" || constraint.name === "conversation_translation_control_events_operation_check" || constraint.name === "conversation_translation_control_events_changed_check") {
          expect(sql).toContain(`CONSTRAINT "${constraint.name}" CHECK (${expression})`);
        }
      }
    }
  });
});
