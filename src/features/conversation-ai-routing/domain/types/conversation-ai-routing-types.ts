import type {AiProviderFailureCategory} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";

export const conversationAiControlStates = ["AUTO", "PAUSED", "HUMAN_TAKEOVER"] as const;
export type ConversationAiControlState = (typeof conversationAiControlStates)[number];

export const conversationAiJobStatuses = ["PENDING", "RUNNING", "SUCCEEDED", "CANCELLED", "SUPERSEDED", "FAILED"] as const;
export type ConversationAiJobStatus = (typeof conversationAiJobStatuses)[number];

export type ConversationAiFailureCategory = AiProviderFailureCategory | "WORKER_RECOVERY_EXHAUSTED" | "INFRASTRUCTURE_FAILURE";

export type CustomerMessageAiFallbackJobPlan = Readonly<{
  id: string;
  triggerMessageId: string;
  notBefore: Date;
  executionId: string;
  createdAt: Date;
}>;

export type ConversationAiContextMessage = Readonly<{
  id: string;
  position: number;
  senderType: "CUSTOMER" | "INTERNAL_USER" | "AI_AGENT" | "SYSTEM";
  channel: "WEBSITE" | "TELEGRAM" | "EMAIL" | "WHATSAPP";
  body: string;
  createdAt: Date;
}>;

export type ClaimedConversationAiJob = Readonly<{
  id: string;
  conversationId: string;
  triggerMessageId: string;
  triggerMessagePosition: number;
  executionId: string;
  leaseToken: string;
  leasedUntil: Date;
  attempts: number;
  createdAt: Date;
}>;
