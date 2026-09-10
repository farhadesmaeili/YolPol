import {createConversationTranslationWorker} from "../../src/composition/conversation-translation/conversation-translation-worker";
import {parseDeploymentEnvironment} from "../../src/shared/config/deployment-environment";
import {runConversationTranslationWorkerOneShot} from "./conversation-translation-runtime";

export async function main(): Promise<void> {
  process.exitCode = await runConversationTranslationWorkerOneShot({
    createRuntime: () => {
      parseDeploymentEnvironment(process.env);
      return createConversationTranslationWorker();
    },
    logger: console,
  });
}

if (require.main === module) void main().catch(() => {
  console.error("Conversation translation one-shot worker failed.");
  process.exitCode = 1;
});
