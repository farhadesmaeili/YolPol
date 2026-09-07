import type {ConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";

export type ConversationTranslationControlDto = ConversationTranslationPolicy & Readonly<{version: number}>;

export type ChangeConversationTranslationControlInput = Readonly<{
  inquiryId: string;
  customerToStaffMode: unknown;
  staffToCustomerMode: unknown;
  aiToStaffMode: unknown;
  expectedVersion: unknown;
}>;
