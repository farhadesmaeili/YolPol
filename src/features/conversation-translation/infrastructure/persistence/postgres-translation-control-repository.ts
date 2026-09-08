import type {Pool, PoolClient} from "pg";
import type {ConversationTranslationControlDto, ConversationTranslationOverrideDto, GlobalTranslationDefaultsDto} from "@/features/conversation-translation/application/dto/translation-control-dto";
import type {ConversationTranslationControlRepository} from "@/features/conversation-translation/application/ports/translation-control-ports";
import {defaultGlobalTranslationPolicy, resolveConversationTranslationPolicy, type ConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";
import {translationPolicyFromRow} from "@/features/conversation-translation/infrastructure/persistence/translation-policy-row";

const globalSettingsId = "GLOBAL";

function version(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error("Invalid persisted translation policy version.");
  return Number(value);
}

function globalDto(row?: Record<string, unknown> | null): GlobalTranslationDefaultsDto {
  return Object.freeze({...(translationPolicyFromRow(row, "global_") ?? defaultGlobalTranslationPolicy), version: version(row?.global_version)});
}

function overrideDto(row?: Record<string, unknown> | null): ConversationTranslationOverrideDto | null {
  const policy = translationPolicyFromRow(row, "override_");
  return policy ? Object.freeze({...policy, version: version(row?.override_version)}) : null;
}

function effectiveDto(row: Record<string, unknown>): ConversationTranslationControlDto {
  const globalDefaults = globalDto(row);
  const override = overrideDto(row);
  return Object.freeze({globalDefaults, override, effective: resolveConversationTranslationPolicy({globalDefaults, override}), source: override ? "OVERRIDE" : "GLOBAL"});
}

async function rollback<T extends "not_found" | "conflict">(client: PoolClient, result: T): Promise<T> {
  await client.query("rollback");
  return result;
}

export class PostgresConversationTranslationControlRepository implements ConversationTranslationControlRepository {
  constructor(private readonly pool: Pool) {}

  async readEffective(inquiryId: string): Promise<ConversationTranslationControlDto | null> {
    const result = await this.pool.query<Record<string, unknown>>(`select c.id as conversation_id,
      global_settings.customer_to_staff_mode as global_customer_to_staff_mode,
      global_settings.staff_to_customer_mode as global_staff_to_customer_mode,
      global_settings.ai_to_staff_mode as global_ai_to_staff_mode,
      global_settings.version as global_version,
      control.customer_to_staff_mode as override_customer_to_staff_mode,
      control.staff_to_customer_mode as override_staff_to_customer_mode,
      control.ai_to_staff_mode as override_ai_to_staff_mode,
      control.version as override_version
      from conversations c
      left join global_translation_settings global_settings on global_settings.id=$2
      left join conversation_translation_controls control on control.conversation_id=c.id
      where c.inquiry_id=$1 limit 1`, [inquiryId, globalSettingsId]);
    return result.rows[0] ? effectiveDto(result.rows[0]) : null;
  }

  async read(inquiryId: string): Promise<(ConversationTranslationPolicy & Readonly<{version: number}>) | null> {
    const value = await this.readEffective(inquiryId);
    return value ? Object.freeze({...value.effective, version: value.override?.version ?? 0}) : null;
  }

  async readGlobalDefaults(): Promise<GlobalTranslationDefaultsDto> {
    const result = await this.pool.query<Record<string, unknown>>(`select customer_to_staff_mode as global_customer_to_staff_mode,
      staff_to_customer_mode as global_staff_to_customer_mode,ai_to_staff_mode as global_ai_to_staff_mode,
      version as global_version from global_translation_settings where id=$1`, [globalSettingsId]);
    return globalDto(result.rows[0]);
  }

  async changeGlobalDefaults(input: ConversationTranslationPolicy & Readonly<{expectedVersion: number; actorReference: string; eventId: string; now: Date}>): Promise<"updated" | "unchanged" | "conflict"> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('global_translation_settings'))");
      const selected = await client.query<Record<string, unknown>>(`select customer_to_staff_mode as global_customer_to_staff_mode,
        staff_to_customer_mode as global_staff_to_customer_mode,ai_to_staff_mode as global_ai_to_staff_mode,
        version as global_version from global_translation_settings where id=$1 for update`, [globalSettingsId]);
      const previous = globalDto(selected.rows[0]);
      if (previous.version !== input.expectedVersion) return await rollback(client, "conflict");
      if (previous.customerToStaffMode === input.customerToStaffMode && previous.staffToCustomerMode === input.staffToCustomerMode && previous.aiToStaffMode === input.aiToStaffMode) {
        await client.query("commit");
        return "unchanged";
      }
      const nextVersion = previous.version + 1;
      if (selected.rows[0]) {
        const updated = await client.query(`update global_translation_settings set
          customer_to_staff_mode=$2,staff_to_customer_mode=$3,ai_to_staff_mode=$4,version=$5,updated_at=$6,updated_by=$7
          where id=$1 and version=$8`, [globalSettingsId, input.customerToStaffMode, input.staffToCustomerMode, input.aiToStaffMode, nextVersion, input.now, input.actorReference, previous.version]);
        if (updated.rowCount !== 1) return await rollback(client, "conflict");
      } else {
        await client.query(`insert into global_translation_settings
          (id,customer_to_staff_mode,staff_to_customer_mode,ai_to_staff_mode,version,updated_at,updated_by)
          values ($1,$2,$3,$4,$5,$6,$7)`, [globalSettingsId, input.customerToStaffMode, input.staffToCustomerMode, input.aiToStaffMode, nextVersion, input.now, input.actorReference]);
      }
      await client.query(`insert into global_translation_setting_events
        (id,settings_id,previous_customer_to_staff_mode,new_customer_to_staff_mode,
        previous_staff_to_customer_mode,new_staff_to_customer_mode,previous_ai_to_staff_mode,new_ai_to_staff_mode,
        previous_version,new_version,actor_reference,occurred_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [input.eventId, globalSettingsId,
        previous.customerToStaffMode, input.customerToStaffMode, previous.staffToCustomerMode, input.staffToCustomerMode,
        previous.aiToStaffMode, input.aiToStaffMode, previous.version, nextVersion, input.actorReference, input.now]);
      await client.query("commit");
      return "updated";
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async changeOverride(input: Readonly<{inquiryId: string; action: "SET" | "REMOVE"; policy?: ConversationTranslationPolicy; expectedVersion: number; actorReference: string; eventId: string; now: Date}>): Promise<"updated" | "unchanged" | "not_found" | "conflict"> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const conversation = await client.query<{id: string}>("select id from conversations where inquiry_id=$1 for update", [input.inquiryId]);
      const conversationId = conversation.rows[0]?.id;
      if (!conversationId) return await rollback(client, "not_found");
      const selected = await client.query<Record<string, unknown>>(`select customer_to_staff_mode as override_customer_to_staff_mode,
        staff_to_customer_mode as override_staff_to_customer_mode,ai_to_staff_mode as override_ai_to_staff_mode,
        version as override_version from conversation_translation_controls where conversation_id=$1 for update`, [conversationId]);
      const previous = overrideDto(selected.rows[0]);
      const previousVersion = previous?.version ?? 0;
      if (previousVersion !== input.expectedVersion) return await rollback(client, "conflict");
      if (input.action === "REMOVE") {
        if (!previous) {
          await client.query("commit");
          return "unchanged";
        }
        const globalResult = await client.query<Record<string, unknown>>(`select customer_to_staff_mode as global_customer_to_staff_mode,
          staff_to_customer_mode as global_staff_to_customer_mode,ai_to_staff_mode as global_ai_to_staff_mode,
          version as global_version from global_translation_settings where id=$1`, [globalSettingsId]);
        const inherited = globalDto(globalResult.rows[0]);
        await client.query(`insert into conversation_translation_control_events
          (id,conversation_id,operation,previous_customer_to_staff_mode,new_customer_to_staff_mode,
          previous_staff_to_customer_mode,new_staff_to_customer_mode,previous_ai_to_staff_mode,new_ai_to_staff_mode,
          previous_version,new_version,actor_reference,occurred_at)
          values ($1,$2,'REMOVE',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [input.eventId, conversationId,
          previous.customerToStaffMode, inherited.customerToStaffMode, previous.staffToCustomerMode, inherited.staffToCustomerMode,
          previous.aiToStaffMode, inherited.aiToStaffMode, previous.version, previous.version + 1, input.actorReference, input.now]);
        const removed = await client.query("delete from conversation_translation_controls where conversation_id=$1 and version=$2", [conversationId, previous.version]);
        if (removed.rowCount !== 1) return await rollback(client, "conflict");
        await client.query("commit");
        return "updated";
      }
      const policy = input.policy;
      if (!policy) throw new Error("Conversation translation override policy is required.");
      if (previous && previous.customerToStaffMode === policy.customerToStaffMode && previous.staffToCustomerMode === policy.staffToCustomerMode && previous.aiToStaffMode === policy.aiToStaffMode) {
        await client.query("commit");
        return "unchanged";
      }
      const nextVersion = previousVersion + 1;
      if (previous) {
        const updated = await client.query(`update conversation_translation_controls set
          customer_to_staff_mode=$2,staff_to_customer_mode=$3,ai_to_staff_mode=$4,version=$5,updated_at=$6,updated_by=$7
          where conversation_id=$1 and version=$8`, [conversationId, policy.customerToStaffMode, policy.staffToCustomerMode, policy.aiToStaffMode, nextVersion, input.now, input.actorReference, previousVersion]);
        if (updated.rowCount !== 1) return await rollback(client, "conflict");
      } else {
        await client.query(`insert into conversation_translation_controls
          (conversation_id,customer_to_staff_mode,staff_to_customer_mode,ai_to_staff_mode,version,updated_at,updated_by)
          values ($1,$2,$3,$4,$5,$6,$7)`, [conversationId, policy.customerToStaffMode, policy.staffToCustomerMode, policy.aiToStaffMode, nextVersion, input.now, input.actorReference]);
      }
      const globalResult = previous ? null : await client.query<Record<string, unknown>>(`select customer_to_staff_mode as global_customer_to_staff_mode,
        staff_to_customer_mode as global_staff_to_customer_mode,ai_to_staff_mode as global_ai_to_staff_mode,
        version as global_version from global_translation_settings where id=$1`, [globalSettingsId]);
      const before = previous ?? resolveConversationTranslationPolicy({globalDefaults: globalDto(globalResult?.rows[0])});
      await client.query(`insert into conversation_translation_control_events
        (id,conversation_id,operation,previous_customer_to_staff_mode,new_customer_to_staff_mode,
        previous_staff_to_customer_mode,new_staff_to_customer_mode,previous_ai_to_staff_mode,new_ai_to_staff_mode,
        previous_version,new_version,actor_reference,occurred_at)
        values ($1,$2,'SET',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [input.eventId, conversationId,
        before.customerToStaffMode, policy.customerToStaffMode, before.staffToCustomerMode, policy.staffToCustomerMode,
        before.aiToStaffMode, policy.aiToStaffMode, previousVersion, nextVersion, input.actorReference, input.now]);
      await client.query("commit");
      return "updated";
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }


  async change(input: ConversationTranslationPolicy & Readonly<{inquiryId: string; expectedVersion: number; actorReference: string; eventId: string; now: Date}>) {
    return this.changeOverride({inquiryId: input.inquiryId, action: "SET", policy: input, expectedVersion: input.expectedVersion, actorReference: input.actorReference, eventId: input.eventId, now: input.now});
  }
}
