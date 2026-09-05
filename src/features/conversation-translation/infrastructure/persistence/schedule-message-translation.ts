import {createHash} from "node:crypto";
import {sql, type SQL} from "drizzle-orm";
import type {Message} from "@/features/inquiries/domain/entities/message";
import {translationIdentity, translationLocale, translationTargets} from "@/features/conversation-translation/domain/types/translation";
import {staffWorkingLocale} from "@/shared/config/conversation-translation";
import type {Locale} from "@/shared/types/locale";

type TranslationTransaction = {execute(query: SQL): Promise<{rows: Record<string, unknown>[]}>};

// Caller owns the Conversation lock and the authoritative message transaction.
export async function scheduleMessageTranslation(transaction: TranslationTransaction, conversationId: string, message: Message, knownSource?: Locale | null): Promise<void> {
  const result = await transaction.execute(sql`select coalesce(
    (select l.source_locale from conversation_messages m join conversation_message_languages l on l.message_id=m.id
      where m.conversation_id=${conversationId} and m.sender_type='CUSTOMER' and m.channel='WEBSITE'
        and l.source_locale is not null order by m.position desc limit 1), i.source_locale) as locale
    from conversations c join inquiries i on i.id=c.inquiry_id where c.id=${conversationId}`);
  const customerLocale = translationLocale(result.rows[0]?.locale);
  const source = knownSource !== undefined ? knownSource
    : message.sourceLocale ?? (message.senderType === "INTERNAL_USER" && (message.channel === "WEBSITE" || message.channel === "TELEGRAM") ? staffWorkingLocale
      : message.senderType === "CUSTOMER" && message.channel === "WEBSITE" ? customerLocale : null);
  if (source !== null) translationLocale(source);
  const target = message.senderType === "INTERNAL_USER" || message.senderType === "AI_AGENT" ? customerLocale : null;
  await transaction.execute(sql`insert into conversation_message_languages (message_id, source_locale, customer_target_locale)
    values (${message.id.value}, ${source}, ${target}) on conflict (message_id) do nothing`);
  if (message.senderType === "SYSTEM") return;
  for (const targetLocale of translationTargets(source, target, staffWorkingLocale)) {
    const id = translationIdentity(message.id.value, targetLocale);
    await transaction.execute(sql`insert into conversation_message_translations (id,message_id,source_locale,target_locale,status,created_at,updated_at)
      values (${id},${message.id.value},${source},${targetLocale},'PENDING',${message.createdAt},${message.createdAt})
      on conflict (message_id,target_locale) do nothing`);
    await transaction.execute(sql`insert into conversation_translation_jobs (id,message_id,target_locale,execution_id,status,created_at,updated_at)
      values (${id},${message.id.value},${targetLocale},${`tx_${createHash("sha256").update(id).digest("hex")}`},'PENDING',${message.createdAt},${message.createdAt})
      on conflict (message_id,target_locale) do nothing`);
  }
}
