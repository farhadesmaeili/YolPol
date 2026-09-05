import type {AiProviderFailureCategory} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";
import {isSupportedLocale, type Locale} from "@/shared/types/locale";

export const translationStatuses = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export type TranslationStatus = (typeof translationStatuses)[number];
export type TranslationFailure = AiProviderFailureCategory | "INVALID_TRANSLATION" | "WORKER_RECOVERY_EXHAUSTED" | "EMERGENCY_DISABLED";
export type MessageLanguage = Readonly<{sourceLocale: Locale | null; customerTargetLocale: Locale | null}>;
export type TranslationView = Readonly<{targetLocale: Locale; status: TranslationStatus; body: string | null}>;
export type MessageTranslationView = MessageLanguage & Readonly<{translations: readonly TranslationView[]; deliveryState?: "ACTIVE" | "SKIPPED"; version?: number}>;
export type TranslationJob = Readonly<{id: string; messageId: string; targetLocale: Locale; sourceLocale: Locale; executionId: string; leaseToken: string}>;

export function translationLocale(value: unknown): Locale {
  if (typeof value !== "string" || !isSupportedLocale(value)) throw new Error("Invalid translation locale.");
  return value;
}

export function translationIdentity(messageId: string, target: Locale): string {
  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(messageId)) throw new Error("Invalid translation message identity.");
  return `translation_${messageId}_${translationLocale(target)}`;
}

export function translationTargets(source: Locale | null, customerTarget: Locale | null, staffTarget: Locale): readonly Locale[] {
  if (source === null) return [];
  translationLocale(source);
  return [...new Set([translationLocale(staffTarget), ...(customerTarget ? [translationLocale(customerTarget)] : [])])].filter((target) => target !== source);
}

export function canTransitionTranslation(from: TranslationStatus, to: TranslationStatus): boolean {
  return (from === "PENDING" && (to === "RUNNING" || to === "CANCELLED"))
    || (from === "RUNNING" && ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED"].includes(to));
}

export function validateTranslationOutput(value: unknown, source: string): string {
  if (typeof value !== "string") throw new Error("Invalid translation output.");
  const text = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  // Sixfold expansion permits short cross-script text; the absolute message limit remains authoritative.
  if (!text || text.length > Math.min(10_000, Math.max(200, source.length * 6))
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)
    || /^(?:```|\{\s*"|<\/?(?:translation|system|assistant)>|(?:translation|translated text|here is (?:the|your) translation)\s*:)/iu.test(text)
    || /<\|(?:im_start|im_end|system|assistant)\|>/u.test(text)) throw new Error("Invalid translation output.");
  return text;
}
