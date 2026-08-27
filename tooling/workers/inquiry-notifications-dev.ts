import {createInquiryNotificationWorker} from "../../src/composition/inquiries/inquiry-notification-worker";
import {runInquiryNotificationDevelopmentCommand} from "./inquiry-notification-runtime";

export async function main(): Promise<void> {
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
