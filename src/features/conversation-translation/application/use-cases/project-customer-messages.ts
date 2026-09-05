import type {MessageTranslationView} from "@/features/conversation-translation/domain/types/translation";
import {Message} from "@/features/inquiries/domain/entities/message";
import type {PositionedConversationMessage} from "@/features/inquiries/application/ports/conversation-ports";

export type TranslatableMessage = PositionedConversationMessage & Readonly<{translation?: MessageTranslationView}>;

export function projectCustomerMessages(rows: readonly TranslatableMessage[]): readonly PositionedConversationMessage[] {
  const visible: PositionedConversationMessage[] = [];
  for (const row of rows) {
    const original = row.message;
    if (original.senderType === "CUSTOMER") { visible.push(row); continue; }
    if (row.translation?.deliveryState === "SKIPPED") continue;
    // SYSTEM and unknown authored languages are never safe outbound fallbacks.
    const language = row.translation;
    if (original.senderType === "SYSTEM" || !language?.sourceLocale || !language.customerTargetLocale) break;
    if (language.sourceLocale === language.customerTargetLocale) { visible.push(row); continue; }
    const translation = language.translations.find((value) => value.targetLocale === language.customerTargetLocale);
    if (translation?.status !== "SUCCEEDED" || !translation.body) break;
    visible.push({position: row.position, message: Message.create({id: original.id.value, senderType: original.senderType,
      channel: original.channel, body: translation.body, createdAt: original.createdAt})});
  }
  return Object.freeze(visible);
}
