import {createConversationAiWorker} from "../../src/composition/conversation-ai-routing/conversation-ai-worker";
import {parseDeploymentEnvironment} from "../../src/shared/config/deployment-environment";
import {createWorkerOperationalLogger, logUnhandledWorkerFailure, nodeWorkerShutdownSource} from "./continuous-worker-runtime";
import {runConversationAiFallbackWorkerCommand} from "./conversation-ai-fallback-runtime";

const service = "conversation-ai-fallback";

export async function main(): Promise<void> {
  process.exitCode = await runConversationAiFallbackWorkerCommand({
    environment: process.env,
    createRuntime: () => {
      parseDeploymentEnvironment(process.env);
      return createConversationAiWorker();
    },
    signals: nodeWorkerShutdownSource,
    logger: createWorkerOperationalLogger(service),
  });
}

if (require.main === module) void main().catch(() => {
  logUnhandledWorkerFailure(service);
  process.exitCode = 1;
});
