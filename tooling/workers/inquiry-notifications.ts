import {createInquiryNotificationWorker} from "../../src/composition/inquiries/inquiry-notification-worker";
import {createWorkerOperationalLogger, logUnhandledWorkerFailure, nodeWorkerShutdownSource} from "./continuous-worker-runtime";
import {runInquiryNotificationWorkerCommand} from "./inquiry-notification-runtime";

const service = "inquiry-notifications";

export async function main(): Promise<void> {
  process.exitCode = await runInquiryNotificationWorkerCommand({
    environment: process.env,
    createRuntime: createInquiryNotificationWorker,
    signals: nodeWorkerShutdownSource,
    logger: createWorkerOperationalLogger(service),
  });
}

if (require.main === module) {
  void main().catch(() => {
    logUnhandledWorkerFailure(service);
    process.exitCode = 1;
  });
}
