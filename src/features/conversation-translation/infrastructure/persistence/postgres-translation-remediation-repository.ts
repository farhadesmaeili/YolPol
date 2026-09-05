import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {TranslationRemediationRepository, RemediationResult} from "@/features/conversation-translation/application/ports/translation-remediation-repository";
import type {TranslationRemediation} from "@/features/conversation-translation/domain/types/translation-remediation";
import {translationIdentity, translationLocale, translationTargets} from "@/features/conversation-translation/domain/types/translation";
import {staffWorkingLocale} from "@/shared/config/conversation-translation";

export class PostgresTranslationRemediationRepository implements TranslationRemediationRepository {
  constructor(private readonly pool: Pool) {}

  async remediate(input: TranslationRemediation & Readonly<{inquiryId: string; messageId: string; actorReference: string}>): Promise<RemediationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      // Match append's Conversation lock; worker fencing always locks jobs before translations.
      const conversation = await client.query("select id from conversations where inquiry_id=$1 for update", [input.inquiryId]);
      if (!conversation.rowCount) { await client.query("rollback"); return "not_found"; }
      const selected = await client.query(`select m.sender_type,l.source_locale,l.customer_target_locale,l.delivery_state,l.version
        from conversation_messages m join conversation_message_languages l on l.message_id=m.id
        where m.id=$1 and m.conversation_id=$2 for update of l`, [input.messageId, conversation.rows[0].id]);
      if (!selected.rowCount) { await client.query("rollback"); return "not_found"; }
      const language = selected.rows[0];
      const conflict = async (): Promise<RemediationResult> => { await client.query("rollback"); return "conflict"; };
      if (language.version !== input.expectedVersion || language.delivery_state === "SKIPPED") return await conflict();
      const jobs = await client.query("select id,status,target_locale from conversation_translation_jobs where message_id=$1 order by id for update", [input.messageId]);
      const translations = await client.query("select id,status,target_locale from conversation_message_translations where message_id=$1 order by id for update", [input.messageId]);
      const eventId = randomUUID();
      let previousState = "ACTIVE";
      let newState = "SKIPPED";
      let translationId: string | null = null;
      if (input.action === "RETRY") {
        const translation = translations.rows.find((row) => row.target_locale === input.targetLocale);
        const job = jobs.rows.find((row) => row.id === translation?.id);
        if (!translation || !job || !["FAILED", "CANCELLED"].includes(translation.status) || job.status !== translation.status) return await conflict();
        previousState = translation.status; newState = "PENDING"; translationId = translation.id;
        // A Staff click creates a new logical Gateway execution; crash recovery keeps this identity.
        await client.query(`update conversation_translation_jobs set status='PENDING',attempts=0,lease_token=null,leased_until=null,
          failure_category=null,execution_id=$2,updated_at=greatest(updated_at,clock_timestamp()),version=version+1 where id=$1`, [translationId, `tx_${eventId}`]);
        await client.query("update conversation_message_translations set status='PENDING',body=null,updated_at=greatest(updated_at,clock_timestamp()),version=version+1 where id=$1", [translationId]);
      } else {
        if (!["INTERNAL_USER", "AI_AGENT", "SYSTEM"].includes(language.sender_type)) return await conflict();
        const targetTranslation = translations.rows.find((row) => row.target_locale === language.customer_target_locale);
        const alreadySafe = language.sender_type !== "SYSTEM" && language.source_locale && language.customer_target_locale
          && (language.source_locale === language.customer_target_locale || targetTranslation?.status === "SUCCEEDED");
        // Never retract content that may already have been visible to the Customer.
        if (alreadySafe) return await conflict();
        if (input.action === "SKIP") {
          await client.query("update conversation_message_languages set delivery_state='SKIPPED' where message_id=$1", [input.messageId]);
          await client.query(`update conversation_translation_jobs set status='CANCELLED',lease_token=null,leased_until=null,
            updated_at=greatest(updated_at,clock_timestamp()),version=version+1 where message_id=$1 and status in ('PENDING','RUNNING')`, [input.messageId]);
          await client.query(`update conversation_message_translations set status='CANCELLED',body=null,updated_at=greatest(updated_at,clock_timestamp()),version=version+1
            where message_id=$1 and status in ('PENDING','RUNNING')`, [input.messageId]);
        } else {
          if (language.source_locale !== null || language.sender_type === "SYSTEM" || jobs.rowCount || translations.rowCount) return await conflict();
          const targetResult = await client.query(`select coalesce($3,
            (select l.source_locale from conversation_messages prior join conversation_message_languages l on l.message_id=prior.id
              where prior.conversation_id=m.conversation_id and prior.position<m.position and prior.sender_type='CUSTOMER'
              and prior.channel='WEBSITE' and l.source_locale is not null order by prior.position desc limit 1),i.source_locale) as locale
            from conversation_messages m join conversations c on c.id=m.conversation_id join inquiries i on i.id=c.inquiry_id
            where m.id=$1 and c.id=$2`, [input.messageId, conversation.rows[0].id, language.customer_target_locale]);
          const target = translationLocale(targetResult.rows[0]?.locale);
          await client.query("update conversation_message_languages set source_locale=$2,customer_target_locale=$3 where message_id=$1", [input.messageId, input.sourceLocale, target]);
          for (const locale of translationTargets(input.sourceLocale, target, staffWorkingLocale)) {
            const id = translationIdentity(input.messageId, locale);
            await client.query(`insert into conversation_message_translations (id,message_id,source_locale,target_locale,status,created_at,updated_at)
              values ($1,$2,$3,$4,'PENDING',clock_timestamp(),clock_timestamp())`, [id, input.messageId, input.sourceLocale, locale]);
            await client.query(`insert into conversation_translation_jobs (id,message_id,target_locale,execution_id,status,created_at,updated_at)
              values ($1,$2,$3,$4,'PENDING',clock_timestamp(),clock_timestamp())`, [id, input.messageId, locale, `tx_${eventId}_${locale}`]);
          }
          previousState = "UNKNOWN"; newState = input.sourceLocale;
        }
      }
      await client.query("update conversation_message_languages set version=version+1 where message_id=$1", [input.messageId]);
      await client.query(`insert into conversation_translation_events (id,message_id,translation_id,action,actor_reference,previous_state,new_state,previous_version,new_version,created_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$8+1,clock_timestamp())`, [eventId, input.messageId, translationId, input.action, input.actorReference, previousState, newState, input.expectedVersion]);
      await client.query("commit"); return "updated";
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
}
