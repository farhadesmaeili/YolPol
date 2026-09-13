import type {ConversationAiControlState, ConversationAiJobStatus} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";
import type {ConversationAgentEscalationReason} from "@/features/conversation-ai-agent/domain/types/conversation-agent-types";

export type ConversationAiStatusDto = Readonly<{
  state: ConversationAiControlState;
  version: number;
  latestJob: Readonly<{status: ConversationAiJobStatus; decision: "RESPOND" | "ESCALATE" | null; escalationReason: ConversationAgentEscalationReason | null; notBefore: string; updatedAt: string}> | null;
}>;

export type ChangeConversationAiControlInput = Readonly<{
  inquiryId: string;
  state: unknown;
  expectedVersion: unknown;
  actorReference: string;
}>;
