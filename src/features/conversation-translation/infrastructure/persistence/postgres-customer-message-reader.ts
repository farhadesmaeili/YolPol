import type {Pool} from "pg";
import {Message} from "@/features/inquiries/domain/entities/message";
import {conversationChannels, messageSenderTypes} from "@/features/inquiries/domain/types/conversation-types";
import {projectCustomerMessages} from "@/features/conversation-translation/application/use-cases/project-customer-messages";
import {translationLocale} from "@/features/conversation-translation/domain/types/translation";

type CustomerRow = {id: string; position: number; sender_type: string; channel: string; body: string; created_at: Date;
  source_locale: string | null; customer_target_locale: string | null; status: string | null; translated_body: string | null;
  barrier_position: number | string | null};

export class PostgresCustomerMessageReader {
  constructor(private readonly pool: Pool) {}

  async findForInquiry(inquiryId: string) {
    const rows = await this.findPositionedForInquiry(inquiryId);
    return rows === null ? null : rows.map(({message}) => message);
  }

  findPositionedForInquiry(inquiryId: string) {
    // Initial history is bounded; the existing SSE replay fills any remaining safe history.
    return this.read(inquiryId, -1, 1000);
  }

  findAfterPositionForInquiry(inquiryId: string, afterPosition: number, limit: number) {
    return this.read(inquiryId, afterPosition, Math.min(100, limit));
  }

  private async read(inquiryId: string, afterPosition: number, limit: number) {
    if (!Number.isSafeInteger(afterPosition) || afterPosition < -1 || !Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid delivery cursor.");
    const conversation = await this.pool.query<{id: string}>("select id from conversations where inquiry_id=$1", [inquiryId]);
    if (!conversation.rows[0]) return null;
    // Keep the earliest potentially remediable hidden reply as the reconnect frontier,
    // while allowing later rows that are independently Customer-safe to be projected.
    // The source body of the held reply never satisfies the outbound predicate.
    const result = await this.pool.query<CustomerRow>(`with barrier as (
      select min(m.position) as position from conversation_messages m
      left join conversation_message_languages l on l.message_id=m.id
      left join conversation_message_translations t on t.message_id=m.id and t.target_locale=l.customer_target_locale
      where m.conversation_id=$1 and m.sender_type not in ('CUSTOMER','SYSTEM') and coalesce(l.delivery_state,'ACTIVE')<>'SKIPPED'
      and (l.source_locale is null or l.customer_target_locale is null
        or (l.source_locale<>l.customer_target_locale
          and (t.status is distinct from 'SUCCEEDED' or t.body is null or length(t.body)=0)))
    ) select m.id,m.position,m.sender_type,m.channel,m.body,m.created_at,l.source_locale,l.customer_target_locale,t.status,t.body as translated_body,
      b.position as barrier_position
      from conversation_messages m cross join barrier b
      left join conversation_message_languages l on l.message_id=m.id
      left join conversation_message_translations t on t.message_id=m.id and t.target_locale=l.customer_target_locale
      where m.conversation_id=$1 and m.position>$2
      and (m.sender_type='CUSTOMER' or coalesce(l.delivery_state,'ACTIVE')<>'SKIPPED')
      and (m.sender_type='CUSTOMER' or (m.sender_type<>'SYSTEM' and l.source_locale is not null
        and l.customer_target_locale is not null and (l.source_locale=l.customer_target_locale
          or (t.status='SUCCEEDED' and t.body is not null and length(t.body)>0))))
      order by m.position limit $3`, [conversation.rows[0].id, afterPosition, limit]);
    const rows = result.rows.map((row) => {
      const senderType = messageSenderTypes.find((value) => value === row.sender_type);
      const channel = conversationChannels.find((value) => value === row.channel);
      if (!senderType || !channel) throw new Error("Invalid message projection.");
      const position = Number(row.position);
      const barrierPosition = row.barrier_position === null ? null : Number(row.barrier_position);
      return {position, ...(barrierPosition !== null && position > barrierPosition ? {resumePosition: barrierPosition - 1} : {}),
        message: Message.create({id: row.id, senderType, channel, body: row.body, createdAt: row.created_at}),
        translation: {sourceLocale: row.source_locale === null ? null : translationLocale(row.source_locale),
          customerTargetLocale: row.customer_target_locale === null ? null : translationLocale(row.customer_target_locale),
          translations: row.status === "SUCCEEDED" ? [{targetLocale: translationLocale(row.customer_target_locale), status: "SUCCEEDED" as const, body: row.translated_body}] : []}};
    });
    return projectCustomerMessages(rows);
  }
}
