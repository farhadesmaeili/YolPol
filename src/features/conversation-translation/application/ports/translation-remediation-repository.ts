import type {TranslationRemediation} from "@/features/conversation-translation/domain/types/translation-remediation";

export type RemediationResult = "updated" | "not_found" | "conflict";
export interface TranslationRemediationRepository {
  remediate(input: TranslationRemediation & Readonly<{inquiryId: string; messageId: string; actorReference: string}>): Promise<RemediationResult>;
}
