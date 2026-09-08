export const customerToStaffTranslationModes = ["AUTO", "MANUAL"] as const;
export type CustomerToStaffTranslationMode = (typeof customerToStaffTranslationModes)[number];

export const staffToCustomerTranslationModes = ["AUTO", "MANUAL"] as const;
export type StaffToCustomerTranslationMode = (typeof staffToCustomerTranslationModes)[number];

export const aiToStaffTranslationModes = ["AUTO", "ON_DEMAND"] as const;
export type AiToStaffTranslationMode = (typeof aiToStaffTranslationModes)[number];

export type ConversationTranslationPolicy = Readonly<{
  customerToStaffMode: CustomerToStaffTranslationMode;
  staffToCustomerMode: StaffToCustomerTranslationMode;
  aiToStaffMode: AiToStaffTranslationMode;
}>;

export const defaultGlobalTranslationPolicy: ConversationTranslationPolicy = Object.freeze({
  customerToStaffMode: "AUTO",
  staffToCustomerMode: "AUTO",
  aiToStaffMode: "ON_DEMAND",
});

export const defaultConversationTranslationPolicy = defaultGlobalTranslationPolicy;

export function resolveConversationTranslationPolicy(input: Readonly<{
  globalDefaults?: ConversationTranslationPolicy | null;
  override?: ConversationTranslationPolicy | null;
}>): ConversationTranslationPolicy {
  const policy = input.override ?? input.globalDefaults ?? defaultGlobalTranslationPolicy;
  return Object.freeze({
    customerToStaffMode: policy.customerToStaffMode,
    staffToCustomerMode: policy.staffToCustomerMode,
    aiToStaffMode: policy.aiToStaffMode,
  });
}

export type TranslatedMessageSender = "CUSTOMER" | "INTERNAL_USER" | "AI_AGENT" | "SYSTEM";
