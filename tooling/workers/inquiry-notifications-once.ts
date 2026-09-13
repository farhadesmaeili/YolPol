import {createInquiryNotificationWorker} from "../../src/composition/inquiries/inquiry-notification-worker";
import {createWorkerOperationalLogger, logUnhandledWorkerFailure} from "./continuous-worker-runtime";
import {runInquiryNotificationWorkerOneShot} from "./inquiry-notification-runtime";

const service = "inquiry-notifications";

export async function main(): Promise<void> {
  process.exitCode = await runInquiryNotificationWorkerOneShot({
    createRuntime: createInquiryNotificationWorker,
    logger: createWorkerOperationalLogger(service),
  });
}

if (require.main === module) {
  void main().catch(() => {
    logUnhandledWorkerFailure(service);
    process.exitCode = 1;
  });
}
