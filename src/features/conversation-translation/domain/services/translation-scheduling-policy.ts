import type {Locale} from "@/shared/types/locale";
import type {ConversationTranslationPolicy, TranslatedMessageSender} from "@/features/conversation-translation/domain/types/translation-control";

export function automaticTranslationTargets(input: Readonly<{
  senderType: TranslatedMessageSender;
  sourceLocale: Locale | null;
  customerTargetLocale: Locale | null;
  staffTargetLocale: Locale;
  policy: ConversationTranslationPolicy;
}>): readonly Locale[] {
  if (input.sourceLocale === null || input.senderType === "SYSTEM") return [];
  const targets: Locale[] = [];
  if (input.senderType === "CUSTOMER" && input.policy.customerToStaffMode === "AUTO") targets.push(input.staffTargetLocale);
  if (input.senderType === "INTERNAL_USER" && input.policy.staffToCustomerMode === "AUTO" && input.customerTargetLocale) targets.push(input.customerTargetLocale);
  if (input.senderType === "AI_AGENT") {
    // Customer-language safety is independent from the Staff convenience policy.
    if (input.customerTargetLocale) targets.push(input.customerTargetLocale);
    if (input.policy.aiToStaffMode === "AUTO") targets.push(input.staffTargetLocale);
  }
  return Object.freeze([...new Set(targets)].filter((target) => target !== input.sourceLocale));
}

export function requestedTranslationTarget(input: Readonly<{
  senderType: TranslatedMessageSender;
  sourceLocale: Locale | null;
  customerTargetLocale: Locale | null;
  staffTargetLocale: Locale;
}>): Locale | null {
  if (input.sourceLocale === null) return null;
  const target = input.senderType === "CUSTOMER" || input.senderType === "AI_AGENT"
    ? input.staffTargetLocale
    : input.senderType === "INTERNAL_USER"
      ? input.customerTargetLocale
      : null;
  return target && target !== input.sourceLocale ? target : null;
}

export function allowsOnDemandTranslation(senderType: TranslatedMessageSender, policy: ConversationTranslationPolicy): boolean {
  return senderType === "CUSTOMER" ? policy.customerToStaffMode === "MANUAL"
    : senderType === "INTERNAL_USER" ? policy.staffToCustomerMode === "MANUAL"
      : senderType === "AI_AGENT" ? policy.aiToStaffMode === "ON_DEMAND"
        : false;
}
