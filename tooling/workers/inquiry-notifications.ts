import {closeInquiryPostgresPool} from "../../src/features/inquiries/infrastructure/database/postgres-pool";
import {createInquiryNotificationWorker} from "../../src/composition/inquiries/inquiry-notification-worker";

let exitCode = 0;
try {
  const result = await createInquiryNotificationWorker().execute();
  console.info(JSON.stringify(result));
  if (result.scheduledForRetry > 0) exitCode = 1;
} catch {
  console.error("Inquiry notification worker failed.");
  exitCode = 1;
} finally {
  await closeInquiryPostgresPool();
}
process.exitCode = exitCode;
