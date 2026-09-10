import type {ConversationAiWorkerRuntime} from "../../src/composition/conversation-ai-routing/conversation-ai-worker";
import {
  runConfiguredContinuousWorker,
  runWorkerOneShot,
  type WorkerPollDelay,
  type WorkerShutdownSource,
} from "./continuous-worker-runtime";

export type ConversationAiFallbackOperationalLogger = Readonly<{info(message: string): void; error(message: string): void}>;
export const conversationAiFallbackWorkerPollEnvironmentVariable = "CONVERSATION_AI_FALLBACK_WORKER_POLL_MS";

export async function runConversationAiFallbackWorkerOneShot(input: Readonly<{
  createRuntime(): ConversationAiWorkerRuntime;
  logger: ConversationAiFallbackOperationalLogger;
}>): Promise<number> {
  return runWorkerOneShot({...input, failureMessage: "Conversation AI fallback worker failed.", isFailure: (result) => result.failed > 0});
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
