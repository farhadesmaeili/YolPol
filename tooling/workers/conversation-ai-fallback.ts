import {createConversationAiWorker} from "../../src/composition/conversation-ai-routing/conversation-ai-worker";
import {runConversationAiFallbackWorkerOneShot} from "./conversation-ai-fallback-runtime";

export async function main(): Promise<void> {
  process.exitCode = await runConversationAiFallbackWorkerOneShot({createRuntime: createConversationAiWorker, logger: console});
}

if (require.main === module) void main().catch(() => {
  console.error("Conversation AI fallback worker failed.");
  process.exitCode = 1;
});
