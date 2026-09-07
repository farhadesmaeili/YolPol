import {createHash} from "node:crypto";
import {sql, type SQL} from "drizzle-orm";
import type {Message} from "@/features/inquiries/domain/entities/message";
import {automaticTranslationTargets} from "@/features/conversation-translation/domain/services/translation-scheduling-policy";
import {
  aiToStaffTranslationModes,
  customerToStaffTranslationModes,
  defaultConversationTranslationPolicy,
  staffToCustomerTranslationModes,
  type ConversationTranslationPolicy,
} from "@/features/conversation-translation/domain/types/translation-control";
import {translationIdentity, translationLocale} from "@/features/conversation-translation/domain/types/translation";
import {staffWorkingLocale} from "@/shared/config/conversation-translation";
import type {Locale} from "@/shared/types/locale";

type TranslationTransaction = {execute(query: SQL): Promise<{rows: Record<string, unknown>[]}>};

function translationPolicy(row: Record<string, unknown> | undefined): ConversationTranslationPolicy {
  if (!row) return defaultConversationTranslationPolicy;
  if (typeof row.customer_to_staff_mode !== "string" || !(customerToStaffTranslationModes as readonly string[]).includes(row.customer_to_staff_mode)
    || typeof row.staff_to_customer_mode !== "string" || !(staffToCustomerTranslationModes as readonly string[]).includes(row.staff_to_customer_mode)
    || typeof row.ai_to_staff_mode !== "string" || !(aiToStaffTranslationModes as readonly string[]).includes(row.ai_to_staff_mode)) {
    throw new Error("Invalid Conversation translation control.");
  }
  return {
    customerToStaffMode: row.customer_to_staff_mode as ConversationTranslationPolicy["customerToStaffMode"],
    staffToCustomerMode: row.staff_to_customer_mode as ConversationTranslationPolicy["staffToCustomerMode"],
    aiToStaffMode: row.ai_to_staff_mode as ConversationTranslationPolicy["aiToStaffMode"],
  };
}

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
  const control = await transaction.execute(sql`select customer_to_staff_mode,staff_to_customer_mode,ai_to_staff_mode
    from conversation_translation_controls where conversation_id=${conversationId}`);
  const policy = translationPolicy(control.rows[0]);
  for (const targetLocale of automaticTranslationTargets({
    senderType: message.senderType,
    sourceLocale: source,
    customerTargetLocale: target,
    staffTargetLocale: staffWorkingLocale,
    policy,
  })) {
    const id = translationIdentity(message.id.value, targetLocale);
    await transaction.execute(sql`insert into conversation_message_translations (id,message_id,source_locale,target_locale,status,created_at,updated_at)
      values (${id},${message.id.value},${source},${targetLocale},'PENDING',${message.createdAt},${message.createdAt})
      on conflict (message_id,target_locale) do nothing`);
    await transaction.execute(sql`insert into conversation_translation_jobs (id,message_id,target_locale,execution_id,status,created_at,updated_at)
      values (${id},${message.id.value},${targetLocale},${`tx_${createHash("sha256").update(id).digest("hex")}`},'PENDING',${message.createdAt},${message.createdAt})
      on conflict (message_id,target_locale) do nothing`);
  }
}
