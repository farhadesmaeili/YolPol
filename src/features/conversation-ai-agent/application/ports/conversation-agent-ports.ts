import type {ExecuteAiProviderRequestInput} from "@/features/ai-provider-gateway/application/use-cases/parse-ai-provider-execution-request";
import type {AiProviderExecutionResult, AiProviderToolDefinition} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";
import type {
  ConversationAgentApprovedKnowledge,
  ConversationAgentEscalationReason,
  ConversationAgentProductSearch,
  ConversationAgentPublicSiteInformation,
  ConversationAgentToolExecution,
  ConversationAgentToolName,
  PublicConversationAgentProduct,
  ConversationAgentResponseCopy,
  ConversationAgentToolValidation,
} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";
import type {Locale} from "@/shared/types/locale";

export interface ConversationAgentGateway {
  execute(input: ExecuteAiProviderRequestInput): Promise<AiProviderExecutionResult>;
}

export interface ConversationAgentProductCatalog {
  search(input: ConversationAgentProductSearch & Readonly<{locale: Locale}>): Promise<readonly PublicConversationAgentProduct[]>;
  getDetails(input: Readonly<{productId?: string; sku?: string; slug?: string; locale: Locale}>): Promise<PublicConversationAgentProduct | null>;
}

export interface ConversationAgentKnowledgeRepository {
  getResponseCopy(locale: Locale): Promise<ConversationAgentResponseCopy>;
  getPublicSiteInformation(locale: Locale): Promise<ConversationAgentPublicSiteInformation>;
  getInquiryProcess(locale: Locale): Promise<ConversationAgentApprovedKnowledge>;
  getPickupProcess(locale: Locale): Promise<ConversationAgentApprovedKnowledge>;
  getStaffReviewResponse(locale: Locale, reason: ConversationAgentEscalationReason): Promise<string>;
}

export interface ConversationAgentToolRegistry {
  definitions(): readonly AiProviderToolDefinition[];
  validate(input: Readonly<{name: string; arguments: string; locale: Locale}>): ConversationAgentToolValidation;
  execute(input: Readonly<{name: string; arguments: string; locale: Locale; signal?: AbortSignal}>): Promise<ConversationAgentToolExecution>;
  isEnabled(name: ConversationAgentToolName): boolean;
}

export interface ConversationAgentClock { now(): Date; }

export interface ConversationAgentEscalationResponse {
  execute(locale: Locale, reason: ConversationAgentEscalationReason): Promise<Readonly<{type: "ESCALATE"; body: string; reason: ConversationAgentEscalationReason}>>;
}
