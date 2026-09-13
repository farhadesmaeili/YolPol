import {isSupportedLocale} from "@/shared/types/locale";
import {translationStatuses, type MessageTranslationView, type TranslationView} from "@/features/conversation-translation/domain/types/translation";

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export function parseMessageTranslation(value: unknown): MessageTranslationView | null {
  if (!record(value) || !["customerTargetLocale,sourceLocale,translations", "customerTargetLocale,deliveryState,sourceLocale,translations,version"].includes(Object.keys(value).sort().join(","))) return null;
  if (value.version !== undefined && (!Number.isSafeInteger(value.version) || Number(value.version) < 1 || !["ACTIVE", "SKIPPED"].includes(String(value.deliveryState)))) return null;
  const source = value.sourceLocale;
  const target = value.customerTargetLocale;
  if ((source !== null && (typeof source !== "string" || !isSupportedLocale(source)))
    || (target !== null && (typeof target !== "string" || !isSupportedLocale(target)))
    || !Array.isArray(value.translations) || value.translations.length > 3) return null;
  const translations: TranslationView[] = [];
  for (const item of value.translations) {
    if (!record(item) || Object.keys(item).sort().join(",") !== "body,status,targetLocale"
      || typeof item.targetLocale !== "string" || !isSupportedLocale(item.targetLocale)) return null;
    const status = translationStatuses.find((candidate) => candidate === item.status);
    if (!status || (status === "SUCCEEDED" ? typeof item.body !== "string" || !item.body.trim() || item.body.length > 10_000 : item.body !== null)) return null;
    if (translations.some((translation) => translation.targetLocale === item.targetLocale)) return null;
    translations.push({targetLocale: item.targetLocale, status, body: typeof item.body === "string" ? item.body : null});
  }
  return {...(value.version !== undefined ? {version: Number(value.version), deliveryState: value.deliveryState === "SKIPPED" ? "SKIPPED" as const : "ACTIVE" as const} : {}), sourceLocale: source, customerTargetLocale: target, translations};
}
