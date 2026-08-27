import type {ProcessInquiryNotificationsResult} from "../../src/features/inquiries/application/use-cases/process-inquiry-notifications";
import type {InquiryNotificationWorkerRuntime} from "../../src/composition/inquiries/inquiry-notification-worker";

export const defaultInquiryNotificationDevPollMilliseconds = 2_000;
const minimumInquiryNotificationDevPollMilliseconds = 500;
const maximumInquiryNotificationDevPollMilliseconds = 60_000;
const shutdownSignals = ["SIGINT", "SIGTERM"] as const;

type ShutdownSignal = (typeof shutdownSignals)[number];

export type InquiryNotificationRuntimeFactory = () => InquiryNotificationWorkerRuntime;

export type InquiryNotificationOperationalLogger = Readonly<{
  info(message: string): void;
  error(message: string): void;
}>;

export type InquiryNotificationShutdownSource = Readonly<{
  on(signal: ShutdownSignal, listener: () => void): void;
  off(signal: ShutdownSignal, listener: () => void): void;
}>;

export type InquiryNotificationPollDelay = (milliseconds: number, signal: AbortSignal) => Promise<void>;

export function readInquiryNotificationDevPollMilliseconds(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const configured = environment.INQUIRY_NOTIFICATION_DEV_POLL_MS;
  if (configured === undefined || configured.trim() === "") return defaultInquiryNotificationDevPollMilliseconds;
  if (!/^[0-9]+$/u.test(configured)) throw new Error("Inquiry notification development poll interval is invalid.");
  const milliseconds = Number(configured);
  if (
    !Number.isSafeInteger(milliseconds)
    || milliseconds < minimumInquiryNotificationDevPollMilliseconds
    || milliseconds > maximumInquiryNotificationDevPollMilliseconds
  ) throw new Error("Inquiry notification development poll interval is invalid.");
  return milliseconds;
}

export function waitForInquiryNotificationPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, {once: true});
  });
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
  let exitCode = 0;
  let runtime: InquiryNotificationWorkerRuntime | undefined;
  try {
    runtime = input.createRuntime();
    const result = await runInquiryNotificationWorkerOnce(runtime);
    input.logger.info(JSON.stringify(result));
    if (result.scheduledForRetry > 0 || result.permanentFailures > 0 || result.unknown > 0) exitCode = 1;
  } catch {
    input.logger.error("Inquiry notification worker failed.");
    exitCode = 1;
  } finally {
    try { await runtime?.close(); }
    catch { exitCode = 1; }
  }
  return exitCode;
}

export async function runInquiryNotificationDevelopmentWorker(input: Readonly<{
  createRuntime: InquiryNotificationRuntimeFactory;
  pollMilliseconds: number;
  delay?: InquiryNotificationPollDelay;
  signals: InquiryNotificationShutdownSource;
  logger: InquiryNotificationOperationalLogger;
}>): Promise<void> {
  const runtime = input.createRuntime();
  const abortDelay = new AbortController();
  const registeredSignals: ShutdownSignal[] = [];
  const delay = input.delay ?? waitForInquiryNotificationPoll;
  let shutdownRequested = false;
  const requestShutdown = () => {
    shutdownRequested = true;
    abortDelay.abort();
  };

  try {
    for (const signal of shutdownSignals) {
      input.signals.on(signal, requestShutdown);
      registeredSignals.push(signal);
    }
    input.logger.info(JSON.stringify({event: "inquiry_notification_dev_worker_started", pollMilliseconds: input.pollMilliseconds}));
    while (!shutdownRequested) {
      try {
        const result = await runInquiryNotificationWorkerOnce(runtime);
        if (result.claimed > 0 || result.scheduledForRetry > 0 || result.permanentFailures > 0 || result.unknown > 0) {
          input.logger.info(JSON.stringify({event: "inquiry_notification_dev_iteration_completed", ...result}));
        }
      } catch {
        input.logger.error(JSON.stringify({event: "inquiry_notification_dev_iteration_failed"}));
      }
      if (!shutdownRequested) await delay(input.pollMilliseconds, abortDelay.signal);
    }
    input.logger.info(JSON.stringify({event: "inquiry_notification_dev_worker_stopped"}));
  } finally {
    for (const signal of registeredSignals) input.signals.off(signal, requestShutdown);
    await runtime.close();
  }
}

export async function runInquiryNotificationDevelopmentCommand(input: Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  createRuntime: InquiryNotificationRuntimeFactory;
  delay?: InquiryNotificationPollDelay;
  signals: InquiryNotificationShutdownSource;
  logger: InquiryNotificationOperationalLogger;
}>): Promise<number> {
  if (input.environment.NODE_ENV === "production") {
    input.logger.error("Inquiry notification development worker is unavailable in production.");
    return 1;
  }
  try {
    await runInquiryNotificationDevelopmentWorker({
      createRuntime: input.createRuntime,
      pollMilliseconds: readInquiryNotificationDevPollMilliseconds(input.environment),
      delay: input.delay,
      signals: input.signals,
      logger: input.logger,
    });
    return 0;
  } catch {
    input.logger.error("Inquiry notification development worker failed.");
    return 1;
  }
}
