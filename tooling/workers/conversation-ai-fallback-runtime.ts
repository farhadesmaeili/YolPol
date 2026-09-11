import type {ConversationAiWorkerRuntime} from "../../src/composition/conversation-ai-routing/conversation-ai-worker";
import {
  runConfiguredContinuousWorker,
  runWorkerOneShot,
  type WorkerOperationalLogger,
  type WorkerPollDelay,
  type WorkerShutdownSource,
} from "./continuous-worker-runtime";

export type ConversationAiFallbackOperationalLogger = WorkerOperationalLogger;
export const conversationAiFallbackWorkerPollEnvironmentVariable = "CONVERSATION_AI_FALLBACK_WORKER_POLL_MS";

export async function runConversationAiFallbackWorkerOneShot(input: Readonly<{
  createRuntime(): ConversationAiWorkerRuntime;
  logger: ConversationAiFallbackOperationalLogger;
}>): Promise<number> {
  return runWorkerOneShot({
    ...input,
    workerName: "conversation_ai_fallback_worker",
    summarize: (result) => result,
    isFailure: (result) => result.failed > 0,
  });
}

export function runConversationAiFallbackWorkerCommand(input: Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  createRuntime(): ConversationAiWorkerRuntime;
  delay?: WorkerPollDelay;
  signals: WorkerShutdownSource;
  logger: ConversationAiFallbackOperationalLogger;
}>): Promise<number> {
  return runConfiguredContinuousWorker({
    ...input,
    workerName: "conversation_ai_fallback_worker",
    pollEnvironmentVariable: conversationAiFallbackWorkerPollEnvironmentVariable,
    summarize: (result) => result,
  });
}
