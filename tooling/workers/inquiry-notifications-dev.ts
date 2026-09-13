import {loadDevelopmentEnv} from "../development/load-development-env";

export async function main(): Promise<void> {
  loadDevelopmentEnv();
  const {runInquiryNotificationDevelopmentCommand} = await import("./inquiry-notification-runtime");
  const {createWorkerOperationalLogger, nodeWorkerShutdownSource} = await import("./continuous-worker-runtime");
  const {createInquiryNotificationWorker} = await import("../../src/composition/inquiries/inquiry-notification-worker");
  process.exitCode = await runInquiryNotificationDevelopmentCommand({
    environment: process.env,
    createRuntime: createInquiryNotificationWorker,
    signals: nodeWorkerShutdownSource,
    logger: createWorkerOperationalLogger("inquiry-notifications-dev"),
  });
}

if (require.main === module) {
  void main().catch(async () => {
    const {logUnhandledWorkerFailure} = await import("./continuous-worker-runtime");
    logUnhandledWorkerFailure("inquiry-notifications-dev");
    process.exitCode = 1;
  });
}
