import type {ConversationTranslationControlDto, ChangeConversationTranslationControlInput} from "@/features/conversation-translation/application/dto/translation-control-dto";
import type {ConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";

export interface TranslationControlClock { now(): Date; }
export interface TranslationControlEventIdGenerator { generate(): string; }

export interface ConversationTranslationControlRepository {
  read(inquiryId: string): Promise<ConversationTranslationControlDto | null>;
  change(input: ConversationTranslationPolicy & Readonly<{
    inquiryId: string;
    expectedVersion: number;
    actorReference: string;
    eventId: string;
    now: Date;
  }>): Promise<"updated" | "unchanged" | "not_found" | "conflict">;
}

export type {ChangeConversationTranslationControlInput};
