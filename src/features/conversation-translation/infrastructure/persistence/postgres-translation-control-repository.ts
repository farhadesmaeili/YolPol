import type {Pool, PoolClient} from "pg";
import type {ConversationTranslationControlDto} from "@/features/conversation-translation/application/dto/translation-control-dto";
import type {ConversationTranslationControlRepository} from "@/features/conversation-translation/application/ports/translation-control-ports";
import {
  defaultConversationTranslationPolicy,
  type AiToStaffTranslationMode,
  type ConversationTranslationPolicy,
  type CustomerToStaffTranslationMode,
  type StaffToCustomerTranslationMode,
} from "@/features/conversation-translation/domain/types/translation-control";

type ControlRow = {
  customer_to_staff_mode: CustomerToStaffTranslationMode;
  staff_to_customer_mode: StaffToCustomerTranslationMode;
  ai_to_staff_mode: AiToStaffTranslationMode;
  version: number;
};

function toDto(row?: ControlRow): ConversationTranslationControlDto {
  return row ? Object.freeze({
    customerToStaffMode: row.customer_to_staff_mode,
    staffToCustomerMode: row.staff_to_customer_mode,
    aiToStaffMode: row.ai_to_staff_mode,
    version: row.version,
  }) : Object.freeze({...defaultConversationTranslationPolicy, version: 0});
}

async function rollback(client: PoolClient, result: "not_found" | "conflict"): Promise<"not_found" | "conflict"> {
  await client.query("rollback");
  return result;
}

export class PostgresConversationTranslationControlRepository implements ConversationTranslationControlRepository {
  constructor(private readonly pool: Pool) {}

  async read(inquiryId: string): Promise<ConversationTranslationControlDto | null> {
    const result = await this.pool.query<ControlRow & {conversation_id: string}>(`select c.id as conversation_id,
      control.customer_to_staff_mode,control.staff_to_customer_mode,control.ai_to_staff_mode,control.version
      from conversations c left join conversation_translation_controls control on control.conversation_id=c.id
      where c.inquiry_id=$1 limit 1`, [inquiryId]);
    const row = result.rows[0];
    if (!row) return null;
    return row.version === null ? toDto() : toDto(row);
  }

  async change(input: ConversationTranslationPolicy & Readonly<{
    inquiryId: string;
    expectedVersion: number;
    actorReference: string;
    eventId: string;
    now: Date;
  }>): Promise<"updated" | "unchanged" | "not_found" | "conflict"> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const conversation = await client.query<{id: string}>("select id from conversations where inquiry_id=$1 for update", [input.inquiryId]);
      const conversationId = conversation.rows[0]?.id;
      if (!conversationId) return await rollback(client, "not_found");
      const selected = await client.query<ControlRow>("select customer_to_staff_mode,staff_to_customer_mode,ai_to_staff_mode,version from conversation_translation_controls where conversation_id=$1 for update", [conversationId]);
      const previous = selected.rows[0] ? toDto(selected.rows[0]) : toDto();
      if (previous.version !== input.expectedVersion) return await rollback(client, "conflict");
      if (previous.customerToStaffMode === input.customerToStaffMode
        && previous.staffToCustomerMode === input.staffToCustomerMode
        && previous.aiToStaffMode === input.aiToStaffMode) {
        await client.query("commit");
        return "unchanged";
      }
      const version = previous.version + 1;
      if (selected.rows[0]) {
        const updated = await client.query(`update conversation_translation_controls set
          customer_to_staff_mode=$2,staff_to_customer_mode=$3,ai_to_staff_mode=$4,version=$5,updated_at=$6,updated_by=$7
          where conversation_id=$1 and version=$8`, [
          conversationId, input.customerToStaffMode, input.staffToCustomerMode, input.aiToStaffMode,
          version, input.now, input.actorReference, previous.version,
        ]);
        if (updated.rowCount !== 1) return await rollback(client, "conflict");
      } else {
        await client.query(`insert into conversation_translation_controls
          (conversation_id,customer_to_staff_mode,staff_to_customer_mode,ai_to_staff_mode,version,updated_at,updated_by)
          values ($1,$2,$3,$4,$5,$6,$7)`, [
          conversationId, input.customerToStaffMode, input.staffToCustomerMode, input.aiToStaffMode,
          version, input.now, input.actorReference,
        ]);
      }
      await client.query(`insert into conversation_translation_control_events
        (id,conversation_id,previous_customer_to_staff_mode,new_customer_to_staff_mode,
        previous_staff_to_customer_mode,new_staff_to_customer_mode,previous_ai_to_staff_mode,new_ai_to_staff_mode,
        previous_version,new_version,actor_reference,occurred_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
        input.eventId, conversationId, previous.customerToStaffMode, input.customerToStaffMode,
        previous.staffToCustomerMode, input.staffToCustomerMode, previous.aiToStaffMode, input.aiToStaffMode,
        previous.version, version, input.actorReference, input.now,
      ]);
      await client.query("commit");
      return "updated";
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
