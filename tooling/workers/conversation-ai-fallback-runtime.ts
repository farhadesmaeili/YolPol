import type {ConversationAiWorkerRuntime} from "../../src/composition/conversation-ai-routing/conversation-ai-worker";

export type ConversationAiFallbackOperationalLogger = Readonly<{info(message: string): void; error(message: string): void}>;

export async function runConversationAiFallbackWorkerOneShot(input: Readonly<{
  createRuntime(): ConversationAiWorkerRuntime;
  logger: ConversationAiFallbackOperationalLogger;
}>): Promise<number> {
  let runtime: ConversationAiWorkerRuntime | undefined;
  let exitCode = 0;
  try {
    runtime = input.createRuntime();
    const result = await runtime.worker.execute();
    input.logger.info(JSON.stringify(result));
    if (result.failed > 0) exitCode = 1;
  } catch {
    input.logger.error("Conversation AI fallback worker failed.");
    exitCode = 1;
  } finally {
    try { await runtime?.close(); } catch { exitCode = 1; }
  }
  return exitCode;
}
