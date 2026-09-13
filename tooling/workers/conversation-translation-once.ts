import {createConversationTranslationWorker} from "../../src/composition/conversation-translation/conversation-translation-worker";
import {parseDeploymentEnvironment} from "../../src/shared/config/deployment-environment";
import {createWorkerOperationalLogger, logUnhandledWorkerFailure} from "./continuous-worker-runtime";
import {runConversationTranslationWorkerOneShot} from "./conversation-translation-runtime";

const service = "conversation-translation";

export async function main(): Promise<void> {
  process.exitCode = await runConversationTranslationWorkerOneShot({
    createRuntime: () => {
      parseDeploymentEnvironment(process.env);
      return createConversationTranslationWorker();
    },
    logger: createWorkerOperationalLogger(service),
  });
}

if (require.main === module) void main().catch(() => {
  logUnhandledWorkerFailure(service);
  process.exitCode = 1;
});
