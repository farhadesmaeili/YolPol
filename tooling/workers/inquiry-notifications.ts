import {createInquiryNotificationWorker} from "../../src/composition/inquiries/inquiry-notification-worker";
import {nodeWorkerShutdownSource} from "./continuous-worker-runtime";
import {runInquiryNotificationWorkerCommand} from "./inquiry-notification-runtime";

export async function main(): Promise<void> {
  process.exitCode = await runInquiryNotificationWorkerCommand({
    environment: process.env,
    createRuntime: createInquiryNotificationWorker,
    signals: nodeWorkerShutdownSource,
    logger: console,
  });
}

if (require.main === module) {
  void main().catch(() => {
    console.error("Inquiry notification worker failed.");
    process.exitCode = 1;
  });
}
