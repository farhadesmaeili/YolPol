import {loadDevelopmentEnv} from "../development/load-development-env";

export async function main(): Promise<void> {
  loadDevelopmentEnv();
  const {createWorkerOperationalLogger, nodeWorkerShutdownSource} = await import("./continuous-worker-runtime");
  const logger = createWorkerOperationalLogger("conversation-ai-fallback-dev");
  if (process.env.NODE_ENV === "production") {
    logger.error("worker.startup_failed", {reason: "production_environment"});
    process.exitCode = 1;
    return;
  }

  const {parseDeploymentEnvironment} = await import("../../src/shared/config/deployment-environment");
  const {runConversationAiFallbackWorkerCommand} = await import("./conversation-ai-fallback-runtime");
  const {createConversationAiWorker} = await import("../../src/composition/conversation-ai-routing/conversation-ai-worker");
  process.exitCode = await runConversationAiFallbackWorkerCommand({
    environment: process.env,
    createRuntime: () => {
      parseDeploymentEnvironment(process.env);
      return createConversationAiWorker();
    },
    signals: nodeWorkerShutdownSource,
    logger,
  });
}

if (require.main === module) void main().catch(async () => {
  const {logUnhandledWorkerFailure} = await import("./continuous-worker-runtime");
  logUnhandledWorkerFailure("conversation-ai-fallback-dev");
  process.exitCode = 1;
});
