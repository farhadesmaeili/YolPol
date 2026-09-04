import {ConversationAiRoutingValidationError} from "@/features/conversation-ai-routing/domain/errors/conversation-ai-routing-errors";

const jobIdPattern = /^ai_job_[A-Za-z0-9_-]{1,96}$/u;

export function parseConversationAiJobId(value: string): string {
  if (!jobIdPattern.test(value)) throw new ConversationAiRoutingValidationError("jobId", "Conversation AI job ID is invalid.");
  return value;
}

export function conversationAiExecutionId(jobId: string): string {
  return `ai_fallback_${parseConversationAiJobId(jobId)}`;
}

export function conversationAiMessageId(jobId: string): string {
  return `ai_response_${parseConversationAiJobId(jobId)}`;
}
