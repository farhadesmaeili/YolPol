import {createConversationTranslationWorker} from "../../src/composition/conversation-translation/conversation-translation-worker";
import {runConversationTranslationWorkerOneShot} from "./conversation-translation-runtime";

export async function main(): Promise<void> {
  process.exitCode = await runConversationTranslationWorkerOneShot({createRuntime: createConversationTranslationWorker, logger: console});
}

if (require.main === module) void main().catch(() => {
  console.error("Conversation translation worker failed.");
  process.exitCode = 1;
});
