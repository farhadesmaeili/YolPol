import type {ConversationAgentDecision, ConversationAgentEscalationReason} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";
import type {AiOperationsDecision} from "@/features/ai-operations/domain/types/ai-operations-types";
import type {ConversationAiStatusDto} from "@/features/conversation-ai-routing/application/dto/conversation-ai-routing-dto";
import type {ClaimedConversationAiJob, ConversationAiContextMessage, ConversationAiControlState, ConversationAiFailureCategory, CustomerMessageAiFallbackJobPlan} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";

export interface ConversationAiJobIdGenerator { generate(): string; }
export interface ConversationAiLeaseTokenGenerator { generate(): string; }
export interface ConversationAiControlEventIdGenerator { generate(): string; }
export interface ConversationAiClock { now(): Date; }

export interface AiOperationsFallbackPlanner {
  execute(input: Readonly<{triggeredAt: Date}>): Promise<Readonly<{status: "scheduled"; notBefore: Date | null; continuationNotBefore: Date}> | Readonly<{status: "suppressed"; reason: string}>>;
}

export interface AiOperationsAvailabilityEvaluator { execute(): Promise<AiOperationsDecision>; }

export interface CustomerMessageAiFallbackPlanner {
  plan(input: Readonly<{triggerMessageId: string; triggeredAt: Date}>): Promise<CustomerMessageAiFallbackJobPlan | null>;
}

export interface ConversationAiResponseGenerator {
  generate(input: Readonly<{executionId: string; messages: readonly ConversationAiContextMessage[]; deadline: Date}>): Promise<ConversationAgentDecision>;
}

export type PrepareConversationAiJobResult =
  | Readonly<{status: "eligible"; messages: readonly ConversationAiContextMessage[]}>
  | Readonly<{status: "cancelled" | "superseded" | "stale_lease"}>;

export type FinalizeConversationAiJobResult = "succeeded" | "cancelled" | "superseded" | "stale_lease";

export interface ConversationAiRoutingRepository {
  claimDue(input: Readonly<{limit: number; now: Date; leaseMilliseconds: number}>): Promise<readonly ClaimedConversationAiJob[]>;
  prepare(input: Readonly<{job: ClaimedConversationAiJob; now: Date; maximumAgeMilliseconds: number}>): Promise<PrepareConversationAiJobResult>;
  cancel(input: Readonly<{job: ClaimedConversationAiJob; now: Date}>): Promise<void>;
  fail(input: Readonly<{job: ClaimedConversationAiJob; category: ConversationAiFailureCategory; now: Date}>): Promise<void>;
  finalize(input: Readonly<{job: ClaimedConversationAiJob; body: string; decision: "RESPOND" | "ESCALATE"; escalationReason?: ConversationAgentEscalationReason; now: Date}>): Promise<FinalizeConversationAiJobResult>;
  readStatus(inquiryId: string): Promise<ConversationAiStatusDto | null>;
  changeControl(input: Readonly<{inquiryId: string; state: ConversationAiControlState; expectedVersion: number; actorReference: string; eventId: string; now: Date}>): Promise<"updated" | "not_found" | "conflict" | "unchanged">;
}
