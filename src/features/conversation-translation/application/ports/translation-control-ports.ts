import type {ConversationTranslationControlDto, ChangeConversationTranslationControlInput, GlobalTranslationDefaultsDto} from "@/features/conversation-translation/application/dto/translation-control-dto";
import type {ConversationTranslationPolicy} from "@/features/conversation-translation/domain/types/translation-control";

export interface TranslationControlClock { now(): Date; }
export interface TranslationControlEventIdGenerator { generate(): string; }

export interface ConversationTranslationControlRepository {
  readEffective(inquiryId: string): Promise<ConversationTranslationControlDto | null>;
  readGlobalDefaults(): Promise<GlobalTranslationDefaultsDto>;
  changeGlobalDefaults(input: ConversationTranslationPolicy & Readonly<{
    expectedVersion: number;
    actorReference: string;
    eventId: string;
    now: Date;
  }>): Promise<"updated" | "unchanged" | "conflict">;
  changeOverride(input: Readonly<{
    inquiryId: string;
    action: "SET" | "REMOVE";
    policy?: ConversationTranslationPolicy;
    expectedVersion: number;
    actorReference: string;
    eventId: string;
    now: Date;
  }>): Promise<"updated" | "unchanged" | "not_found" | "conflict">;
}

export type {ChangeConversationTranslationControlInput};
