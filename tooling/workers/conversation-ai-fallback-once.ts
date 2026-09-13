import {createConversationAiWorker} from "../../src/composition/conversation-ai-routing/conversation-ai-worker";
import {parseDeploymentEnvironment} from "../../src/shared/config/deployment-environment";
import {createWorkerOperationalLogger, logUnhandledWorkerFailure} from "./continuous-worker-runtime";
import {runConversationAiFallbackWorkerOneShot} from "./conversation-ai-fallback-runtime";

const service = "conversation-ai-fallback";

export async function main(): Promise<void> {
  process.exitCode = await runConversationAiFallbackWorkerOneShot({
    createRuntime: () => {
      parseDeploymentEnvironment(process.env);
      return createConversationAiWorker();
    },
    logger: createWorkerOperationalLogger(service),
  });
}

if (require.main === module) void main().catch(() => {
  logUnhandledWorkerFailure(service);
  process.exitCode = 1;
});
