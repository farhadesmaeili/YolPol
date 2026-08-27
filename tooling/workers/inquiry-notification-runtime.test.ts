import {describe, expect, it, vi} from "vitest";

import type {ProcessInquiryNotificationsResult} from "../../src/features/inquiries/application/use-cases/process-inquiry-notifications";
import type {InquiryNotificationWorkerRuntime} from "../../src/composition/inquiries/inquiry-notification-worker";
import {
  defaultInquiryNotificationDevPollMilliseconds,
  readInquiryNotificationDevPollMilliseconds,
  runInquiryNotificationDevelopmentCommand,
  runInquiryNotificationDevelopmentWorker,
  runInquiryNotificationWorkerOneShot,
  type InquiryNotificationShutdownSource,
} from "./inquiry-notification-runtime";

const emptyResult: ProcessInquiryNotificationsResult = Object.freeze({
  claimed: 0,
  processed: 0,
  scheduledForRetry: 0,
  delivered: 0,
  permanentFailures: 0,
  unknown: 0,
});

class FakeShutdownSignals implements InquiryNotificationShutdownSource {
  private readonly listeners = new Map<"SIGINT" | "SIGTERM", Set<() => void>>();

  on(signal: "SIGINT" | "SIGTERM", listener: () => void): void {
    const listeners = this.listeners.get(signal) ?? new Set();
    listeners.add(listener);
    this.listeners.set(signal, listeners);
  }

  off(signal: "SIGINT" | "SIGTERM", listener: () => void): void {
    this.listeners.get(signal)?.delete(listener);
  }

  emit(signal: "SIGINT" | "SIGTERM"): void {
    for (const listener of this.listeners.get(signal) ?? []) listener();
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

function fakeRuntime(execute = vi.fn().mockResolvedValue(emptyResult)) {
  const close = vi.fn().mockResolvedValue(undefined);
  const runtime: InquiryNotificationWorkerRuntime = {worker: {execute}, close};
  return {runtime, execute, close};
}

function logger() {
  return {info: vi.fn(), error: vi.fn()};
}

describe("Inquiry notification worker runtime", () => {
  it("runs the one-shot worker exactly once and closes its resources exactly once", async () => {
    const value = fakeRuntime();
    const createRuntime = vi.fn(() => value.runtime);
    const operationalLogger = logger();

    await expect(runInquiryNotificationWorkerOneShot({createRuntime, logger: operationalLogger})).resolves.toBe(0);
    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(value.execute).toHaveBeenCalledTimes(1);
    expect(value.close).toHaveBeenCalledTimes(1);
    expect(operationalLogger.info).toHaveBeenCalledWith(JSON.stringify(emptyResult));
  });

  it("closes one-shot resources exactly once after a safe failure", async () => {
    const value = fakeRuntime(vi.fn().mockRejectedValue(new Error("postgresql://secret@example.test/yolpol")));
    const operationalLogger = logger();

    await expect(runInquiryNotificationWorkerOneShot({createRuntime: () => value.runtime, logger: operationalLogger})).resolves.toBe(1);
    expect(value.close).toHaveBeenCalledTimes(1);
    expect(operationalLogger.error).toHaveBeenCalledWith("Inquiry notification worker failed.");
    expect(JSON.stringify(operationalLogger.error.mock.calls)).not.toContain("postgresql://secret@example.test/yolpol");
  });

  it("runs multiple development iterations without overlap or runtime recreation", async () => {
    const signals = new FakeShutdownSignals();
    let active = 0;
    let maximumActive = 0;
    const execute = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return emptyResult;
    });
    const value = fakeRuntime(execute);
    const createRuntime = vi.fn(() => value.runtime);
    const delay = vi.fn(async () => {
      if (delay.mock.calls.length === 2) signals.emit("SIGINT");
    });

    await runInquiryNotificationDevelopmentWorker({createRuntime, pollMilliseconds: 2_000, delay, signals, logger: logger()});

    expect(execute).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
    expect(delay).toHaveBeenCalledTimes(2);
    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(value.close).toHaveBeenCalledTimes(1);
    expect(signals.listenerCount()).toBe(0);
  });

  it("logs a failed iteration, waits, and retries without exposing the failure", async () => {
    const signals = new FakeShutdownSignals();
    const order: string[] = [];
    const execute = vi.fn()
      .mockImplementationOnce(async () => { order.push("execute-failed"); throw new Error("123456:BOT_SECRET_SENTINEL"); })
      .mockImplementationOnce(async () => { order.push("execute-retried"); return emptyResult; });
    const value = fakeRuntime(execute);
    const operationalLogger = logger();
    const delay = vi.fn(async () => {
      order.push("delay");
      if (delay.mock.calls.length === 2) signals.emit("SIGTERM");
    });

    await runInquiryNotificationDevelopmentWorker({
      createRuntime: () => value.runtime,
      pollMilliseconds: 2_000,
      delay,
      signals,
      logger: operationalLogger,
    });

    expect(order).toEqual(["execute-failed", "delay", "execute-retried", "delay"]);
    expect(operationalLogger.error).toHaveBeenCalledWith(JSON.stringify({event: "inquiry_notification_dev_iteration_failed"}));
    expect(JSON.stringify(operationalLogger.error.mock.calls)).not.toContain("123456:BOT_SECRET_SENTINEL");
    expect(value.close).toHaveBeenCalledTimes(1);
  });

  it("finishes an active iteration after shutdown and starts no delay or later iteration", async () => {
    const signals = new FakeShutdownSignals();
    let markIterationStarted: (() => void) | undefined;
    let finishIteration: (() => void) | undefined;
    const iterationStarted = new Promise<void>((resolveStarted) => { markIterationStarted = resolveStarted; });
    const execute = vi.fn(() => new Promise<ProcessInquiryNotificationsResult>((resolveIteration) => {
      finishIteration = () => resolveIteration(emptyResult);
      markIterationStarted?.();
    }));
    const value = fakeRuntime(execute);
    const delay = vi.fn();
    const running = runInquiryNotificationDevelopmentWorker({
      createRuntime: () => value.runtime,
      pollMilliseconds: 2_000,
      delay,
      signals,
      logger: logger(),
    });

    await iterationStarted;
    signals.emit("SIGINT");
    finishIteration?.();
    await running;

    expect(execute).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
    expect(value.close).toHaveBeenCalledTimes(1);
  });

  it.each(["SIGINT", "SIGTERM"] as const)("handles %s as a graceful exactly-once shutdown", async (signal) => {
    const signals = new FakeShutdownSignals();
    const value = fakeRuntime();
    const delay = vi.fn(async () => { signals.emit(signal); });

    await runInquiryNotificationDevelopmentWorker({
      createRuntime: () => value.runtime,
      pollMilliseconds: 2_000,
      delay,
      signals,
      logger: logger(),
    });

    expect(value.execute).toHaveBeenCalledTimes(1);
    expect(value.close).toHaveBeenCalledTimes(1);
    expect(signals.listenerCount()).toBe(0);
  });

  it("uses a safe default and validates the optional development interval", () => {
    expect(readInquiryNotificationDevPollMilliseconds({})).toBe(defaultInquiryNotificationDevPollMilliseconds);
    expect(readInquiryNotificationDevPollMilliseconds({INQUIRY_NOTIFICATION_DEV_POLL_MS: "2500"})).toBe(2_500);
    for (const invalid of ["0", "499", "60001", "1.5", "fast", "-1"]) {
      expect(() => readInquiryNotificationDevPollMilliseconds({INQUIRY_NOTIFICATION_DEV_POLL_MS: invalid})).toThrow(
        "Inquiry notification development poll interval is invalid.",
      );
    }
  });

  it("refuses production before creating the development runtime", async () => {
    const signals = new FakeShutdownSignals();
    const createRuntime = vi.fn(() => fakeRuntime().runtime);
    const operationalLogger = logger();

    await expect(runInquiryNotificationDevelopmentCommand({
      environment: {NODE_ENV: "production", INQUIRY_NOTIFICATION_DEV_POLL_MS: "invalid"},
      createRuntime,
      signals,
      logger: operationalLogger,
    })).resolves.toBe(1);

    expect(createRuntime).not.toHaveBeenCalled();
    expect(signals.listenerCount()).toBe(0);
    expect(operationalLogger.error).toHaveBeenCalledWith("Inquiry notification development worker is unavailable in production.");
  });

  it("keeps the development command available when NODE_ENV is not production", async () => {
    const signals = new FakeShutdownSignals();
    const value = fakeRuntime();
    const createRuntime = vi.fn(() => value.runtime);
    const delay = vi.fn(async () => { signals.emit("SIGTERM"); });

    await expect(runInquiryNotificationDevelopmentCommand({
      environment: {},
      createRuntime,
      delay,
      signals,
      logger: logger(),
    })).resolves.toBe(0);

    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(value.execute).toHaveBeenCalledTimes(1);
    expect(value.close).toHaveBeenCalledTimes(1);
  });
});
