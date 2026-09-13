import type {ProcessTranslationJobs} from "../../src/features/conversation-translation/application/use-cases/process-translation-jobs";
import {
  runConfiguredContinuousWorker,
  runWorkerOneShot,
  type ContinuousWorkerRuntime,
  type WorkerOperationalLogger,
  type WorkerPollDelay,
  type WorkerShutdownSource,
} from "./continuous-worker-runtime";

export const conversationTranslationWorkerPollEnvironmentVariable = "CONVERSATION_TRANSLATION_WORKER_POLL_MS";

type TranslationWorkerResult = Awaited<ReturnType<ProcessTranslationJobs["execute"]>>;
type TranslationWorkerRuntime = ContinuousWorkerRuntime<TranslationWorkerResult>;

export async function runConversationTranslationWorkerOneShot(input: Readonly<{
  createRuntime(): TranslationWorkerRuntime;
  logger: WorkerOperationalLogger;
}>): Promise<number> {
  return runWorkerOneShot({
    ...input,
    workerName: "conversation_translation_worker",
    summarize: (result) => result,
    isFailure: (result) => result.failed > 0,
  });
}

export function runConversationTranslationWorkerCommand(input: Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  createRuntime(): TranslationWorkerRuntime;
  delay?: WorkerPollDelay;
  signals: WorkerShutdownSource;
  logger: WorkerOperationalLogger;
}>): Promise<number> {
  return runConfiguredContinuousWorker({
    ...input,
    workerName: "conversation_translation_worker",
    pollEnvironmentVariable: conversationTranslationWorkerPollEnvironmentVariable,
    summarize: (result) => result,
  });
}
