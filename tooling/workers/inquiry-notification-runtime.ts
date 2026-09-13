import type {ProcessInquiryNotificationsResult} from "../../src/features/inquiries/application/use-cases/process-inquiry-notifications";
import type {InquiryNotificationWorkerRuntime} from "../../src/composition/inquiries/inquiry-notification-worker";
import {
  defaultWorkerPollMilliseconds,
  runConfiguredContinuousWorker,
  runContinuousWorker,
  runWorkerOneShot,
  type WorkerOperationalLogger,
  type WorkerPollDelay,
  type WorkerShutdownSource,
} from "./continuous-worker-runtime";

export const inquiryNotificationWorkerPollEnvironmentVariable = "INQUIRY_NOTIFICATION_WORKER_POLL_MS";
export const defaultInquiryNotificationDevPollMilliseconds = defaultWorkerPollMilliseconds;

export type InquiryNotificationRuntimeFactory = () => InquiryNotificationWorkerRuntime;

export type InquiryNotificationOperationalLogger = WorkerOperationalLogger;
export type InquiryNotificationShutdownSource = WorkerShutdownSource;
export type InquiryNotificationPollDelay = WorkerPollDelay;

export function readInquiryNotificationDevPollMilliseconds(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const configured = environment.INQUIRY_NOTIFICATION_DEV_POLL_MS;
  if (configured === undefined || configured.trim() === "") return defaultInquiryNotificationDevPollMilliseconds;
  if (!/^[0-9]+$/u.test(configured)) throw new Error("Inquiry notification development poll interval is invalid.");
  const milliseconds = Number(configured);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 500 || milliseconds > 60_000) {
    throw new Error("Inquiry notification development poll interval is invalid.");
  }
  return milliseconds;
}

export function runInquiryNotificationWorkerOnce(
  runtime: InquiryNotificationWorkerRuntime,
): Promise<ProcessInquiryNotificationsResult> {
  return runtime.worker.execute();
}

export async function runInquiryNotificationWorkerOneShot(input: Readonly<{
  createRuntime: InquiryNotificationRuntimeFactory;
  logger: InquiryNotificationOperationalLogger;
}>): Promise<number> {
  return runWorkerOneShot({
    ...input,
    workerName: "inquiry_notification_worker",
    summarize,
    isFailure: (result) => result.scheduledForRetry > 0 || result.permanentFailures > 0 || result.unknown > 0,
  });
}

function summarize(result: ProcessInquiryNotificationsResult): Readonly<Record<string, number>> {
  return result;
}

export function runInquiryNotificationWorkerCommand(input: Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  createRuntime: InquiryNotificationRuntimeFactory;
  delay?: InquiryNotificationPollDelay;
  signals: InquiryNotificationShutdownSource;
  logger: InquiryNotificationOperationalLogger;
}>): Promise<number> {
  return runConfiguredContinuousWorker({
    workerName: "inquiry_notification_worker",
    environment: input.environment,
    pollEnvironmentVariable: inquiryNotificationWorkerPollEnvironmentVariable,
    createRuntime: input.createRuntime,
    summarize,
    delay: input.delay,
    signals: input.signals,
    logger: input.logger,
  });
}

export function runInquiryNotificationDevelopmentWorker(input: Readonly<{
  createRuntime: InquiryNotificationRuntimeFactory;
  pollMilliseconds: number;
  delay?: InquiryNotificationPollDelay;
  signals: InquiryNotificationShutdownSource;
  logger: InquiryNotificationOperationalLogger;
}>): Promise<number> {
  return runContinuousWorker({
    workerName: "inquiry_notification_dev_worker",
    createRuntime: input.createRuntime,
    pollMilliseconds: input.pollMilliseconds,
    summarize,
    delay: input.delay,
    signals: input.signals,
    logger: input.logger,
  });
}

export async function runInquiryNotificationDevelopmentCommand(input: Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  createRuntime: InquiryNotificationRuntimeFactory;
  delay?: InquiryNotificationPollDelay;
  signals: InquiryNotificationShutdownSource;
  logger: InquiryNotificationOperationalLogger;
}>): Promise<number> {
  if (input.environment.NODE_ENV === "production") {
    input.logger.error("worker.startup_failed", {worker: "inquiry_notification_dev_worker", reason: "production_environment"});
    return 1;
  }
  try {
    return await runInquiryNotificationDevelopmentWorker({
      createRuntime: input.createRuntime,
      pollMilliseconds: readInquiryNotificationDevPollMilliseconds(input.environment),
      delay: input.delay,
      signals: input.signals,
      logger: input.logger,
    });
  } catch {
    input.logger.error("worker.startup_failed", {worker: "inquiry_notification_dev_worker"});
    return 1;
  }
}
