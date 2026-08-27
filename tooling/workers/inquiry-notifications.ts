import {createInquiryNotificationWorker} from "../../src/composition/inquiries/inquiry-notification-worker";
import {runInquiryNotificationWorkerOneShot} from "./inquiry-notification-runtime";

export async function main(): Promise<void> {
  process.exitCode = await runInquiryNotificationWorkerOneShot({
    createRuntime: createInquiryNotificationWorker,
    logger: console,
  });
}

if (require.main === module) {
  void main().catch(() => {
    console.error("Inquiry notification worker failed.");
    process.exitCode = 1;
  });
}
