import type {ConversationAiControlState, ConversationAiJobStatus} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";

export type ConversationAiStatusDto = Readonly<{
  state: ConversationAiControlState;
  version: number;
  latestJob: Readonly<{status: ConversationAiJobStatus; notBefore: string; updatedAt: string}> | null;
}>;

export type ChangeConversationAiControlInput = Readonly<{
  inquiryId: string;
  state: unknown;
  expectedVersion: unknown;
  actorReference: string;
}>;
