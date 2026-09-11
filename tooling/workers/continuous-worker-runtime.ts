import {
  createStructuredLogger,
  type StructuredLogger,
} from "../../src/shared/infrastructure/observability/structured-logger";

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;

export const defaultWorkerPollMilliseconds = 2_000;
export const minimumWorkerPollMilliseconds = 500;
export const maximumWorkerPollMilliseconds = 60_000;

export type WorkerShutdownSignal = (typeof shutdownSignals)[number];

export type ContinuousWorkerRuntime<TResult> = Readonly<{
  worker: Readonly<{execute(): Promise<TResult>}>;
  close(): Promise<void>;
}>;

export type WorkerOperationalLogger = Pick<StructuredLogger, "info" | "error">;

export type WorkerShutdownSource = Readonly<{
  on(signal: WorkerShutdownSignal, listener: () => void): void;
  off(signal: WorkerShutdownSignal, listener: () => void): void;
}>;

export type WorkerPollDelay = (milliseconds: number, signal: AbortSignal) => Promise<void>;

export const nodeWorkerShutdownSource: WorkerShutdownSource = Object.freeze({
  on: (signal, listener) => { process.on(signal, listener); },
  off: (signal, listener) => { process.off(signal, listener); },
});

export function createWorkerOperationalLogger(service: string): StructuredLogger {
  return createStructuredLogger({service});
}

export function logUnhandledWorkerFailure(service: string): void {
  createStructuredLogger({
    service,
    environment: {NODE_ENV: process.env.NODE_ENV, YOLPOL_LOG_LEVEL: "info"},
  }).error("worker.unhandled_failure");
}

export function readWorkerPollMilliseconds(input: Readonly<{
  environment: Readonly<Record<string, string | undefined>>;
  environmentVariable: string;
  defaultMilliseconds?: number;
}>): number {
  const configured = input.environment[input.environmentVariable];
  if (configured === undefined || configured.trim() === "") {
    return input.defaultMilliseconds ?? defaultWorkerPollMilliseconds;
  }
  if (!/^[0-9]+$/u.test(configured)) throw new Error(`${input.environmentVariable} is invalid.`);
  const milliseconds = Number(configured);
  if (
    !Number.isSafeInteger(milliseconds)
    || milliseconds < minimumWorkerPollMilliseconds
    || milliseconds > maximumWorkerPollMilliseconds
  ) throw new Error(`${input.environmentVariable} is invalid.`);
  return milliseconds;
}

export function waitForWorkerPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
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

export function workerFailureDelayMilliseconds(pollMilliseconds: number, consecutiveFailures: number): number {
  const exponent = Math.min(Math.max(0, consecutiveFailures - 1), 4);
  return Math.min(maximumWorkerPollMilliseconds, Math.max(5_000, pollMilliseconds) * (2 ** exponent));
}

export async function runContinuousWorker<TResult>(input: Readonly<{
  workerName: string;
  createRuntime(): ContinuousWorkerRuntime<TResult>;
  pollMilliseconds: number;
  summarize(result: TResult): Readonly<Record<string, number>>;
  delay?: WorkerPollDelay;
  signals: WorkerShutdownSource;
  logger: WorkerOperationalLogger;
}>): Promise<number> {
  let runtime: ContinuousWorkerRuntime<TResult>;
  try {
    runtime = input.createRuntime();
  } catch {
    input.logger.error("worker.startup_failed", {worker: input.workerName});
    return 1;
  }

  const abortDelay = new AbortController();
  const registeredSignals: Array<Readonly<{signal: WorkerShutdownSignal; listener: () => void}>> = [];
  const delay = input.delay ?? waitForWorkerPoll;
  let shutdownRequested = false;
  let consecutiveFailures = 0;
  let exitCode = 0;

  const requestShutdown = (signal: WorkerShutdownSignal) => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    input.logger.info("worker.stopping", {worker: input.workerName, signal});
    abortDelay.abort();
  };

  try {
    for (const signal of shutdownSignals) {
      const listener = () => { requestShutdown(signal); };
      input.signals.on(signal, listener);
      registeredSignals.push({signal, listener});
    }
    input.logger.info("worker.started", {worker: input.workerName, pollMilliseconds: input.pollMilliseconds});

    while (!shutdownRequested) {
      let waitMilliseconds = input.pollMilliseconds;
      try {
        const result = await runtime.worker.execute();
        consecutiveFailures = 0;
        const summary = input.summarize(result);
        if ((summary.claimed ?? 0) > 0) {
          input.logger.info("worker.iteration_completed", {worker: input.workerName, ...summary});
        }
      } catch {
        consecutiveFailures += 1;
        waitMilliseconds = workerFailureDelayMilliseconds(input.pollMilliseconds, consecutiveFailures);
        input.logger.error("worker.iteration_failed", {worker: input.workerName, retryMilliseconds: waitMilliseconds});
      }
      if (!shutdownRequested) await delay(waitMilliseconds, abortDelay.signal);
    }
  } catch {
    input.logger.error("worker.runtime_failed", {worker: input.workerName});
    exitCode = 1;
  } finally {
    for (const {signal, listener} of registeredSignals) input.signals.off(signal, listener);
    try {
      await runtime.close();
    } catch {
      input.logger.error("worker.shutdown_failed", {worker: input.workerName});
      exitCode = 1;
    }
  }

  input.logger.info("worker.stopped", {worker: input.workerName});
  return exitCode;
}

export async function runConfiguredContinuousWorker<TResult>(input: Readonly<{
  workerName: string;
  environment: Readonly<Record<string, string | undefined>>;
  pollEnvironmentVariable: string;
  defaultPollMilliseconds?: number;
  createRuntime(): ContinuousWorkerRuntime<TResult>;
  summarize(result: TResult): Readonly<Record<string, number>>;
  delay?: WorkerPollDelay;
  signals: WorkerShutdownSource;
  logger: WorkerOperationalLogger;
}>): Promise<number> {
  let pollMilliseconds: number;
  try {
    pollMilliseconds = readWorkerPollMilliseconds({
      environment: input.environment,
      environmentVariable: input.pollEnvironmentVariable,
      defaultMilliseconds: input.defaultPollMilliseconds,
    });
  } catch {
    input.logger.error("worker.startup_failed", {worker: input.workerName});
    return 1;
  }
  return runContinuousWorker({...input, pollMilliseconds});
}

export async function runWorkerOneShot<TResult>(input: Readonly<{
  workerName: string;
  createRuntime(): ContinuousWorkerRuntime<TResult>;
  summarize(result: TResult): Readonly<Record<string, number>>;
  isFailure(result: TResult): boolean;
  logger: WorkerOperationalLogger;
}>): Promise<number> {
  let runtime: ContinuousWorkerRuntime<TResult> | undefined;
  let exitCode = 0;
  try {
    runtime = input.createRuntime();
    const result = await runtime.worker.execute();
    input.logger.info("worker.once_completed", {worker: input.workerName, ...input.summarize(result)});
    if (input.isFailure(result)) exitCode = 1;
  } catch {
    input.logger.error("worker.once_failed", {worker: input.workerName});
    exitCode = 1;
  } finally {
    try { await runtime?.close(); }
    catch {
      input.logger.error("worker.shutdown_failed", {worker: input.workerName});
      exitCode = 1;
    }
  }
  return exitCode;
}
