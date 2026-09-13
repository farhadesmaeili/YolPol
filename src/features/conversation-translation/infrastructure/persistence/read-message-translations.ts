import {sql, type SQL} from "drizzle-orm";
import {translationLocale, translationStatuses, type MessageTranslationView, type TranslationView} from "@/features/conversation-translation/domain/types/translation";

export async function readMessageTranslations(database: {execute(query: SQL): Promise<{rows: Record<string, unknown>[]}>}, conversationId: string, messageIds?: readonly string[]): Promise<ReadonlyMap<string, MessageTranslationView>> {
  if (messageIds?.length === 0) return new Map();
  const selectedMessages = messageIds ? sql`and l.message_id in (${sql.join(messageIds.map((id) => sql`${id}`), sql`,`)})` : sql``;
  const result = await database.execute(sql`select l.message_id,l.source_locale,l.customer_target_locale,l.delivery_state,l.version,t.target_locale,t.status,t.body
    from conversation_message_languages l join conversation_messages m on m.id=l.message_id
    left join conversation_message_translations t on t.message_id=l.message_id where m.conversation_id=${conversationId} ${selectedMessages}`);
  const views = new Map<string, MessageTranslationView>();
  for (const row of result.rows) {
    if (typeof row.message_id !== "string") throw new Error("Invalid message language identity.");
    const existing = views.get(row.message_id);
    const translations: TranslationView[] = [...(existing?.translations ?? [])];
    if (row.target_locale !== null) {
      const status = translationStatuses.find((value) => value === row.status);
      if (!status || (row.body !== null && typeof row.body !== "string")) throw new Error("Invalid translation state.");
      translations.push({targetLocale: translationLocale(row.target_locale), status, body: row.body});
    }
    if ((row.delivery_state !== "ACTIVE" && row.delivery_state !== "SKIPPED") || !Number.isSafeInteger(row.version) || Number(row.version) < 1) throw new Error("Invalid delivery state.");
    views.set(row.message_id, {deliveryState: row.delivery_state, version: Number(row.version), sourceLocale: row.source_locale === null ? null : translationLocale(row.source_locale),
      customerTargetLocale: row.customer_target_locale === null ? null : translationLocale(row.customer_target_locale), translations});
  }
  return views;
}
