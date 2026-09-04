import {loadDevelopmentEnv} from "../development/load-development-env";

export async function main(): Promise<void> {
  loadDevelopmentEnv();
  const {runInquiryNotificationDevelopmentCommand} = await import("./inquiry-notification-runtime");
  const {createInquiryNotificationWorker} = await import("../../src/composition/inquiries/inquiry-notification-worker");
  process.exitCode = await runInquiryNotificationDevelopmentCommand({
    environment: process.env,
    createRuntime: createInquiryNotificationWorker,
    signals: {
      on: (signal, listener) => { process.on(signal, listener); },
      off: (signal, listener) => { process.off(signal, listener); },
    },
    logger: console,
  });
}

if (require.main === module) {
  void main().catch(() => {
    console.error("Inquiry notification development worker failed.");
    process.exitCode = 1;
  });
}
