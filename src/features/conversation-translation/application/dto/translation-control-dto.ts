import {defaultGlobalTranslationPolicy, type ConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";

export type GlobalTranslationDefaultsDto = ConversationTranslationPolicy & Readonly<{version: number}>;

export type ConversationTranslationOverrideDto = ConversationTranslationPolicy & Readonly<{version: number}>;

export type ConversationTranslationControlDto = Readonly<{
  globalDefaults: GlobalTranslationDefaultsDto;
  override: ConversationTranslationOverrideDto | null;
  effective: ConversationTranslationPolicy;
  source: "GLOBAL" | "OVERRIDE";
}>;

export const defaultConversationTranslationControlDto: ConversationTranslationControlDto = Object.freeze({
  globalDefaults: Object.freeze({...defaultGlobalTranslationPolicy, version: 0}),
  override: null,
  effective: defaultGlobalTranslationPolicy,
  source: "GLOBAL",
});

export type ChangeGlobalTranslationDefaultsInput = Readonly<{
  customerToStaffMode: unknown;
  staffToCustomerMode: unknown;
  aiToStaffMode: unknown;
  expectedVersion: unknown;
}>;

export type ChangeConversationTranslationControlInput = Readonly<{
  inquiryId: string;
  action: unknown;
  customerToStaffMode?: unknown;
  staffToCustomerMode?: unknown;
  aiToStaffMode?: unknown;
  expectedVersion: unknown;
}>;
