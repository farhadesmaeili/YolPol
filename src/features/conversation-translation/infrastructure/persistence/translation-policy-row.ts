import {
  aiToStaffTranslationModes,
  customerToStaffTranslationModes,
  staffToCustomerTranslationModes,
  defaultGlobalTranslationPolicy,
  resolveConversationTranslationPolicy,
  type ConversationTranslationPolicy,
} from "@/features/conversation-translation/domain/types/translation-control";

export function translationPolicyFromRow(row: Record<string, unknown> | null | undefined, prefix = ""): ConversationTranslationPolicy | null {
  if (!row) return null;
  const customerToStaffMode = row[`${prefix}customer_to_staff_mode`];
  const staffToCustomerMode = row[`${prefix}staff_to_customer_mode`];
  const aiToStaffMode = row[`${prefix}ai_to_staff_mode`];
  if (customerToStaffMode === null && staffToCustomerMode === null && aiToStaffMode === null) return null;
  if (typeof customerToStaffMode !== "string" || !(customerToStaffTranslationModes as readonly string[]).includes(customerToStaffMode)
    || typeof staffToCustomerMode !== "string" || !(staffToCustomerTranslationModes as readonly string[]).includes(staffToCustomerMode)
    || typeof aiToStaffMode !== "string" || !(aiToStaffTranslationModes as readonly string[]).includes(aiToStaffMode)) {
    throw new Error("Invalid persisted translation policy.");
  }
  return Object.freeze({
    customerToStaffMode: customerToStaffMode as ConversationTranslationPolicy["customerToStaffMode"],
    staffToCustomerMode: staffToCustomerMode as ConversationTranslationPolicy["staffToCustomerMode"],
    aiToStaffMode: aiToStaffMode as ConversationTranslationPolicy["aiToStaffMode"],
  });
}

export function effectiveTranslationPolicyFromRows(
  globalRow: Record<string, unknown> | null | undefined,
  overrideRow: Record<string, unknown> | null | undefined,
): ConversationTranslationPolicy {
  return resolveConversationTranslationPolicy({
    globalDefaults: translationPolicyFromRow(globalRow) ?? defaultGlobalTranslationPolicy,
    override: translationPolicyFromRow(overrideRow),
  });
}
