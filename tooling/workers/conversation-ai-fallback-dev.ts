import {loadDevelopmentEnv} from "../development/load-development-env";

export async function main(): Promise<void> {
  loadDevelopmentEnv();
  if (process.env.NODE_ENV === "production") {
    console.error("Conversation AI fallback development worker is unavailable in production.");
    process.exitCode = 1;
    return;
  }

  const {runConversationAiFallbackWorkerOneShot} = await import("./conversation-ai-fallback-runtime");
  const {createConversationAiWorker} = await import("../../src/composition/conversation-ai-routing/conversation-ai-worker");
  process.exitCode = await runConversationAiFallbackWorkerOneShot({createRuntime: createConversationAiWorker, logger: console});
}

if (require.main === module) void main().catch(() => {
  console.error("Conversation AI fallback development worker failed.");
  process.exitCode = 1;
});
