import {createConversationAiWorker} from "../../src/composition/conversation-ai-routing/conversation-ai-worker";
import {parseDeploymentEnvironment} from "../../src/shared/config/deployment-environment";
import {runConversationAiFallbackWorkerOneShot} from "./conversation-ai-fallback-runtime";

export async function main(): Promise<void> {
  process.exitCode = await runConversationAiFallbackWorkerOneShot({
    createRuntime: () => {
      parseDeploymentEnvironment(process.env);
      return createConversationAiWorker();
    },
    logger: console,
  });
}

if (require.main === module) void main().catch(() => {
  console.error("Conversation AI fallback one-shot worker failed.");
  process.exitCode = 1;
});
