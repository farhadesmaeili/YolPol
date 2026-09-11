import {loadDevelopmentEnv} from "../development/load-development-env";

export async function main(): Promise<void> {
  loadDevelopmentEnv();
  const {createWorkerOperationalLogger, nodeWorkerShutdownSource} = await import("./continuous-worker-runtime");
  const logger = createWorkerOperationalLogger("conversation-translation-dev");
  if (process.env.NODE_ENV === "production") {
    logger.error("worker.startup_failed", {reason: "production_environment"});
    process.exitCode = 1;
    return;
  }
  const {createConversationTranslationWorker} = await import("../../src/composition/conversation-translation/conversation-translation-worker");
  const {parseDeploymentEnvironment} = await import("../../src/shared/config/deployment-environment");
  const {runConversationTranslationWorkerCommand} = await import("./conversation-translation-runtime");
  process.exitCode = await runConversationTranslationWorkerCommand({
    environment: process.env,
    createRuntime: () => {
      parseDeploymentEnvironment(process.env);
      return createConversationTranslationWorker();
    },
    signals: nodeWorkerShutdownSource,
    logger,
  });
}

if (require.main === module) void main().catch(async () => {
  const {logUnhandledWorkerFailure} = await import("./continuous-worker-runtime");
  logUnhandledWorkerFailure("conversation-translation-dev");
  process.exitCode = 1;
});
