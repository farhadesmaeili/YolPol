import type {Pool} from "pg";

import type {
  ConversationChannelBindingRepository,
  ConversationChannelDeliveryRepository,
  ConversationChannelInboundRepository,
  ConversationChannelLeaseTokenGenerator,
  RecordInboundChannelTextResult,
  SaveConversationChannelBindingResult,
  ScheduleConversationChannelDeliveryResult,
} from "@/features/conversation-channels/application/ports/conversation-channel-ports";
import type {ConversationChannelBinding} from "@/features/conversation-channels/domain/entities/conversation-channel-binding";
import {ConversationChannelBinding as Binding} from "@/features/conversation-channels/domain/entities/conversation-channel-binding";
import type {ConversationChannelBindingIdentity, ConversationChannelBindingSnapshot, ClaimedConversationChannelDelivery} from "@/features/conversation-channels/domain/types/conversation-channel-types";
import {conversationChannelMaximumDeliveryAttempts, parseConversationChannelDate, parseConversationChannelExternalReference, parseConversationChannelFailureCategory, parseConversationChannelInternalId, parseExternalConversationChannel} from "@/features/conversation-channels/domain/value-objects/conversation-channel-values";

type BindingRow = {
  id: string;
  conversation_id: string;
  channel: string;
  provider_key: string;
  external_account_reference: string;
  external_conversation_reference: string;
  external_participant_reference: string;
  created_at: Date;
  updated_at: Date;
};

type DeliverableRow = BindingRow & {
  delivery_id: string;
  message_id: string;
  body: string;
  attempts: number;
};

function bindingFromRow(row: BindingRow): ConversationChannelBindingSnapshot {
  return Binding.create({
    id: row.id,
    conversationId: row.conversation_id,
    channel: parseExternalConversationChannel(row.channel),
    providerKey: row.provider_key,
    externalAccountReference: row.external_account_reference,
    externalConversationReference: row.external_conversation_reference,
    externalParticipantReference: row.external_participant_reference,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }).toSnapshot();
}

function sameInstant(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}

export class PostgresConversationChannelRepository implements ConversationChannelBindingRepository, ConversationChannelInboundRepository, ConversationChannelDeliveryRepository {
  constructor(
    private readonly pool: Pool,
    private readonly leaseTokens: ConversationChannelLeaseTokenGenerator,
  ) {}

  async save(bindingEntity: ConversationChannelBinding): Promise<SaveConversationChannelBindingResult> {
    const binding = bindingEntity.toSnapshot();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const conversation = await client.query<{id: string}>("select id from conversations where id=$1", [binding.conversationId]);
      if (!conversation.rows[0]) {
        await client.query("commit");
        return {status: "conversation_not_found"};
      }
      const inserted = await client.query<BindingRow>(`insert into conversation_channel_bindings
        (id,conversation_id,channel,provider_key,external_account_reference,external_conversation_reference,external_participant_reference,created_at,updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing returning *`, [
        binding.id, binding.conversationId, binding.channel, binding.providerKey,
        binding.externalAccountReference, binding.externalConversationReference, binding.externalParticipantReference,
        binding.createdAt, binding.updatedAt,
      ]);
      if (inserted.rows[0]) {
        await client.query("commit");
        return {status: "created", binding: bindingFromRow(inserted.rows[0])};
      }
      const existing = await client.query<BindingRow>(`select * from conversation_channel_bindings
        where channel=$1 and provider_key=$2 and external_account_reference=$3 and external_conversation_reference=$4`, [
        binding.channel, binding.providerKey, binding.externalAccountReference, binding.externalConversationReference,
      ]);
      await client.query("commit");
      const row = existing.rows[0];
      if (row && row.conversation_id === binding.conversationId && row.external_participant_reference === binding.externalParticipantReference) {
        return {status: "duplicate", binding: bindingFromRow(row)};
      }
      return {status: "conflict"};
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async findByIdentity(identity: ConversationChannelBindingIdentity): Promise<ConversationChannelBindingSnapshot | null> {
    const result = await this.pool.query<BindingRow>(`select * from conversation_channel_bindings
      where channel=$1 and provider_key=$2 and external_account_reference=$3
        and external_conversation_reference=$4 and external_participant_reference=$5 limit 1`, [
      identity.channel, identity.providerKey, identity.externalAccountReference,
      identity.externalConversationReference, identity.externalParticipantReference,
    ]);
    return result.rows[0] ? bindingFromRow(result.rows[0]) : null;
  }

  async record(input: Parameters<ConversationChannelInboundRepository["record"]>[0]): Promise<RecordInboundChannelTextResult> {
    const id = parseConversationChannelInternalId(input.id, "inboundMessageId");
    const receivedAt = parseConversationChannelDate(input.receivedAt, "receivedAt");
    const result = await this.pool.query<{
      id: string;
      binding_id: string;
      conversation_id: string;
      external_message_reference: string;
      body: string;
      occurred_at: Date;
      correlated_message_id: string | null;
    }>(`insert into conversation_channel_inbound_messages
      (id,binding_id,conversation_id,external_message_reference,body,occurred_at,received_at)
      values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning
      id,binding_id,conversation_id,external_message_reference,body,occurred_at,correlated_message_id`, [
      id, input.binding.id, input.binding.conversationId, input.message.externalMessageReference,
      input.message.body, input.message.occurredAt, receivedAt,
    ]);
    const row = result.rows[0];
    if (row) return {status: "recorded", inboundMessageId: row.id, bindingId: row.binding_id, conversationId: row.conversation_id, correlatedMessageId: row.correlated_message_id};
    const duplicate = await this.pool.query<{
      id: string;
      binding_id: string;
      conversation_id: string;
      body: string;
      occurred_at: Date;
      correlated_message_id: string | null;
    }>(`select id,binding_id,conversation_id,body,occurred_at,correlated_message_id
      from conversation_channel_inbound_messages where binding_id=$1 and external_message_reference=$2`, [
      input.binding.id, input.message.externalMessageReference,
    ]);
    const existing = duplicate.rows[0];
    if (!existing || existing.conversation_id !== input.binding.conversationId
      || existing.body !== input.message.body || !sameInstant(existing.occurred_at, input.message.occurredAt)) return {status: "conflict"};
    return {status: "duplicate", inboundMessageId: existing.id, bindingId: existing.binding_id,
      conversationId: existing.conversation_id, correlatedMessageId: existing.correlated_message_id};
  }

  async schedule(input: Parameters<ConversationChannelDeliveryRepository["schedule"]>[0]): Promise<ScheduleConversationChannelDeliveryResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const binding = await client.query<{conversation_id: string}>("select conversation_id from conversation_channel_bindings where id=$1 for share", [input.bindingId]);
      if (!binding.rows[0]) {
        await client.query("commit");
        return {status: "binding_not_found"};
      }
      const message = await client.query<{conversation_id: string; position: number; sender_type: string; body: string; source_locale: string | null; customer_target_locale: string | null; delivery_state: string | null; translation_status: string | null; translated_body: string | null}>(`select
          m.conversation_id,m.position,m.sender_type,m.body,l.source_locale,l.customer_target_locale,l.delivery_state,
          t.status as translation_status,t.body as translated_body
        from conversation_messages m
        left join conversation_message_languages l on l.message_id=m.id
        left join conversation_message_translations t on t.message_id=m.id and t.target_locale=l.customer_target_locale
        where m.id=$1 for share of m`, [input.messageId]);
      const row = message.rows[0];
      if (!row) {
        await client.query("commit");
        return {status: "message_not_found"};
      }
      if (row.conversation_id !== binding.rows[0].conversation_id) {
        await client.query("commit");
        return {status: "binding_mismatch"};
      }
      if ((row.sender_type !== "INTERNAL_USER" && row.sender_type !== "AI_AGENT") || row.delivery_state === "SKIPPED") {
        await client.query("commit");
        return {status: "not_customer_visible"};
      }
      if (!row.source_locale || !row.customer_target_locale
        || (row.source_locale !== row.customer_target_locale && (row.translation_status !== "SUCCEEDED" || !row.translated_body))) {
        await client.query("commit");
        return {status: "translation_not_ready"};
      }
      const barrier = await client.query<{blocked: boolean}>(`select exists(
        select 1 from conversation_messages earlier
        join conversation_message_languages language on language.message_id=earlier.id
        left join conversation_message_translations translation
          on translation.message_id=earlier.id and translation.target_locale=language.customer_target_locale
        where earlier.conversation_id=$1 and earlier.position<$2 and earlier.sender_type<>'CUSTOMER'
          and language.delivery_state<>'SKIPPED' and language.source_locale is not null
          and language.customer_target_locale is not null and language.source_locale<>language.customer_target_locale
          and translation.status is distinct from 'SUCCEEDED'
      ) as blocked`, [row.conversation_id, row.position]);
      if (barrier.rows[0]?.blocked) {
        await client.query("commit");
        return {status: "translation_not_ready"};
      }
      const inserted = await client.query<{id: string}>(`insert into conversation_channel_deliveries
        (id,conversation_id,message_id,binding_id,status,attempts,available_at,created_at,updated_at,version)
        values ($1,$2,$3,$4,'PENDING',0,$5,$5,$5,1) on conflict do nothing returning id`, [
        input.id, row.conversation_id, input.messageId, input.bindingId, input.now,
      ]);
      if (inserted.rows[0]) {
        await client.query("commit");
        return {status: "scheduled", deliveryId: inserted.rows[0].id};
      }
      const duplicate = await client.query<{id: string}>("select id from conversation_channel_deliveries where message_id=$1 and binding_id=$2", [input.messageId, input.bindingId]);
      await client.query("commit");
      return duplicate.rows[0] ? {status: "duplicate", deliveryId: duplicate.rows[0].id} : {status: "conflict"};
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDue(input: Parameters<ConversationChannelDeliveryRepository["claimDue"]>[0]): Promise<readonly ClaimedConversationChannelDelivery[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100
      || !Number.isSafeInteger(input.leaseMilliseconds) || input.leaseMilliseconds < 10_000 || input.leaseMilliseconds > 300_000) {
      throw new RangeError("Conversation channel claim input is invalid.");
    }
    const now = parseConversationChannelDate(input.now, "now");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(`update conversation_channel_deliveries set
        status='UNKNOWN',failure_category='UNKNOWN_OUTCOME',lease_token=null,leased_until=null,
        terminal_at=$1,updated_at=$1,version=version+1
        where status='RUNNING' and leased_until<=$1`, [now]);
      const candidates = await client.query<DeliverableRow>(`select
          d.id as delivery_id,d.message_id,d.attempts,
          b.id,b.conversation_id,b.channel,b.provider_key,b.external_account_reference,
          b.external_conversation_reference,b.external_participant_reference,b.created_at,b.updated_at,
          case when language.source_locale=language.customer_target_locale then message.body else translation.body end as body
        from conversation_channel_deliveries d
        join conversation_channel_bindings b on b.id=d.binding_id and b.conversation_id=d.conversation_id
        join conversation_messages message on message.id=d.message_id and message.conversation_id=d.conversation_id
        join conversation_message_languages language on language.message_id=message.id
        left join conversation_message_translations translation
          on translation.message_id=message.id and translation.target_locale=language.customer_target_locale
        where d.status='PENDING' and d.available_at<=$1
          and message.sender_type in ('INTERNAL_USER','AI_AGENT') and language.delivery_state='ACTIVE'
          and language.source_locale is not null and language.customer_target_locale is not null
          and (language.source_locale=language.customer_target_locale
            or (translation.status='SUCCEEDED' and translation.body is not null))
          and not exists (
            select 1 from conversation_messages earlier
            join conversation_message_languages earlier_language on earlier_language.message_id=earlier.id
            left join conversation_message_translations earlier_translation
              on earlier_translation.message_id=earlier.id and earlier_translation.target_locale=earlier_language.customer_target_locale
            where earlier.conversation_id=d.conversation_id and earlier.position<message.position
              and earlier.sender_type<>'CUSTOMER' and earlier_language.delivery_state<>'SKIPPED'
              and earlier_language.source_locale is not null and earlier_language.customer_target_locale is not null
              and earlier_language.source_locale<>earlier_language.customer_target_locale
              and earlier_translation.status is distinct from 'SUCCEEDED'
          )
        order by d.available_at,d.created_at,d.id limit $2 for update of d skip locked`, [now, input.limit]);
      const claimed: ClaimedConversationChannelDelivery[] = [];
      for (const candidate of candidates.rows) {
        const leaseToken = parseConversationChannelInternalId(this.leaseTokens.generate(), "leaseToken");
        const leasedUntil = new Date(now.getTime() + input.leaseMilliseconds);
        const updated = await client.query<{attempts: number}>(`update conversation_channel_deliveries set
          status='RUNNING',attempts=attempts+1,lease_token=$2,leased_until=$3,failure_category=null,
          updated_at=$4,version=version+1 where id=$1 and status='PENDING' returning attempts`, [
          candidate.delivery_id, leaseToken, leasedUntil, now,
        ]);
        if (!updated.rows[0]) continue;
        claimed.push(Object.freeze({
          id: candidate.delivery_id,
          conversationId: candidate.conversation_id,
          messageId: candidate.message_id,
          channel: parseExternalConversationChannel(candidate.channel),
          providerKey: candidate.provider_key,
          externalAccountReference: parseConversationChannelExternalReference(candidate.external_account_reference, "externalAccountReference"),
          externalConversationReference: parseConversationChannelExternalReference(candidate.external_conversation_reference, "externalConversationReference"),
          externalParticipantReference: parseConversationChannelExternalReference(candidate.external_participant_reference, "externalParticipantReference"),
          body: candidate.body,
          attempts: updated.rows[0].attempts,
          leaseToken,
          leasedUntil,
        }));
      }
      await client.query("commit");
      return Object.freeze(claimed);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async isLeaseCurrent(input: Parameters<ConversationChannelDeliveryRepository["isLeaseCurrent"]>[0]): Promise<boolean> {
    // A previously unknown earlier language can be confirmed after the batch was
    // claimed. Recheck the safe prefix as well as ownership before dispatch.
    const result = await this.pool.query(`select 1 from conversation_channel_deliveries d
      join conversation_messages message on message.id=d.message_id and message.conversation_id=d.conversation_id
      join conversation_message_languages language on language.message_id=message.id
      left join conversation_message_translations translation
        on translation.message_id=message.id and translation.target_locale=language.customer_target_locale
      where d.id=$1 and d.status='RUNNING' and d.lease_token=$2 and d.leased_until>$3
        and message.sender_type in ('INTERNAL_USER','AI_AGENT') and language.delivery_state='ACTIVE'
        and language.source_locale is not null and language.customer_target_locale is not null
        and (language.source_locale=language.customer_target_locale
          or (translation.status='SUCCEEDED' and translation.body is not null))
        and not exists (
          select 1 from conversation_messages earlier
          join conversation_message_languages earlier_language on earlier_language.message_id=earlier.id
          left join conversation_message_translations earlier_translation
            on earlier_translation.message_id=earlier.id and earlier_translation.target_locale=earlier_language.customer_target_locale
          where earlier.conversation_id=d.conversation_id and earlier.position<message.position
            and earlier.sender_type<>'CUSTOMER' and earlier_language.delivery_state<>'SKIPPED'
            and earlier_language.source_locale is not null and earlier_language.customer_target_locale is not null
            and earlier_language.source_locale<>earlier_language.customer_target_locale
            and earlier_translation.status is distinct from 'SUCCEEDED'
        )`, [
      input.job.id, input.job.leaseToken, parseConversationChannelDate(input.now, "now"),
    ]);
    return result.rowCount === 1;
  }

  async markDelivered(input: Parameters<ConversationChannelDeliveryRepository["markDelivered"]>[0]): Promise<boolean> {
    const providerReference = parseConversationChannelExternalReference(input.providerMessageReference, "providerMessageReference");
    return this.finalize(input.job, input.now, `status='DELIVERED',provider_message_reference=$4,failure_category=null,delivered_at=$3,terminal_at=$3`, [providerReference]);
  }

  async markRetryable(input: Parameters<ConversationChannelDeliveryRepository["markRetryable"]>[0]): Promise<"rescheduled" | "failed" | "stale_lease"> {
    const category = parseConversationChannelFailureCategory(input.category);
    if (category === "UNKNOWN_OUTCOME") throw new RangeError("An unknown outcome cannot be retried.");
    const now = parseConversationChannelDate(input.now, "now");
    const availableAt = parseConversationChannelDate(input.availableAt, "availableAt");
    if (availableAt < now) throw new RangeError("Retry availability cannot predate finalization.");
    const result = await this.pool.query<{status: string}>(`update conversation_channel_deliveries set
      status=case when attempts>=$6 then 'FAILED' else 'PENDING' end,
      failure_category=$4,available_at=case when attempts>=$6 then available_at else $5 end,
      terminal_at=case when attempts>=$6 then $3 else null end,
      lease_token=null,leased_until=null,updated_at=$3,version=version+1
      where id=$1 and status='RUNNING' and lease_token=$2 and leased_until>$3 returning status`, [
      input.job.id, input.job.leaseToken, now, category, availableAt, conversationChannelMaximumDeliveryAttempts,
    ]);
    if (!result.rows[0]) return "stale_lease";
    return result.rows[0].status === "FAILED" ? "failed" : "rescheduled";
  }

  async markFailed(input: Parameters<ConversationChannelDeliveryRepository["markFailed"]>[0]): Promise<boolean> {
    const category = parseConversationChannelFailureCategory(input.category);
    if (category === "UNKNOWN_OUTCOME") return this.markUnknown(input);
    return this.finalize(input.job, input.now, `status='FAILED',failure_category=$4,terminal_at=$3`, [category]);
  }

  async markUnknown(input: Parameters<ConversationChannelDeliveryRepository["markUnknown"]>[0]): Promise<boolean> {
    return this.finalize(input.job, input.now, `status='UNKNOWN',failure_category='UNKNOWN_OUTCOME',terminal_at=$3`, []);
  }

  private async finalize(job: ClaimedConversationChannelDelivery, nowInput: Date, setClause: string, extra: readonly unknown[]): Promise<boolean> {
    const now = parseConversationChannelDate(nowInput, "now");
    const result = await this.pool.query(`update conversation_channel_deliveries set
      ${setClause},lease_token=null,leased_until=null,updated_at=$3,version=version+1
      where id=$1 and status='RUNNING' and lease_token=$2 and leased_until>$3`, [job.id, job.leaseToken, now, ...extra]);
    return result.rowCount === 1;
  }
}
