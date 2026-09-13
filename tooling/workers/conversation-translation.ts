import {createConversationTranslationWorker} from "../../src/composition/conversation-translation/conversation-translation-worker";
import {parseDeploymentEnvironment} from "../../src/shared/config/deployment-environment";
import {createWorkerOperationalLogger, logUnhandledWorkerFailure, nodeWorkerShutdownSource} from "./continuous-worker-runtime";
import {runConversationTranslationWorkerCommand} from "./conversation-translation-runtime";

const service = "conversation-translation";

export async function main(): Promise<void> {
  process.exitCode = await runConversationTranslationWorkerCommand({
    environment: process.env,
    createRuntime: () => {
      parseDeploymentEnvironment(process.env);
      return createConversationTranslationWorker();
    },
    signals: nodeWorkerShutdownSource,
    logger: createWorkerOperationalLogger(service),
  });
}

if (require.main === module) void main().catch(() => {
  logUnhandledWorkerFailure(service);
  process.exitCode = 1;
});
