import {loadDevelopmentEnv} from "../development/load-development-env";

export async function main(): Promise<void> {
  loadDevelopmentEnv();
  if (process.env.NODE_ENV === "production") {
    console.error("Conversation translation development worker is unavailable in production.");
    process.exitCode = 1;
    return;
  }
  const {createConversationTranslationWorker} = await import("../../src/composition/conversation-translation/conversation-translation-worker");
  const {parseDeploymentEnvironment} = await import("../../src/shared/config/deployment-environment");
  const {nodeWorkerShutdownSource} = await import("./continuous-worker-runtime");
  const {runConversationTranslationWorkerCommand} = await import("./conversation-translation-runtime");
  process.exitCode = await runConversationTranslationWorkerCommand({
    environment: process.env,
    createRuntime: () => {
      parseDeploymentEnvironment(process.env);
      return createConversationTranslationWorker();
    },
    signals: nodeWorkerShutdownSource,
    logger: console,
  });
}

if (require.main === module) void main().catch(() => {
  console.error("Conversation translation development worker failed.");
  process.exitCode = 1;
});
