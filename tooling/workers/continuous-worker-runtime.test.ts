import {describe, expect, it, vi} from "vitest";

import {
  readWorkerPollMilliseconds,
  runConfiguredContinuousWorker,
  runContinuousWorker,
  workerFailureDelayMilliseconds,
  type WorkerShutdownSignal,
  type WorkerShutdownSource,
} from "./continuous-worker-runtime";

class FakeShutdownSignals implements WorkerShutdownSource {
  private readonly listeners = new Map<WorkerShutdownSignal, Set<() => void>>();

  on(signal: WorkerShutdownSignal, listener: () => void): void {
    const listeners = this.listeners.get(signal) ?? new Set();
    listeners.add(listener);
    this.listeners.set(signal, listeners);
  }

  off(signal: WorkerShutdownSignal, listener: () => void): void {
    this.listeners.get(signal)?.delete(listener);
  }

  emit(signal: WorkerShutdownSignal): void {
    for (const listener of this.listeners.get(signal) ?? []) listener();
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
  }
}

const emptyResult = Object.freeze({claimed: 0, succeeded: 0});

function logger() {
  return {info: vi.fn(), error: vi.fn()};
}

describe("continuous worker runtime", () => {
  it("keeps polling an empty queue without busy-spinning or recreating resources", async () => {
    const signals = new FakeShutdownSignals();
    const execute = vi.fn().mockResolvedValue(emptyResult);
    const close = vi.fn().mockResolvedValue(undefined);
    const createRuntime = vi.fn(() => ({worker: {execute}, close}));
    const operationalLogger = logger();
    const delay = vi.fn(async (milliseconds: number, signal: AbortSignal) => {
      void milliseconds;
      void signal;
      if (delay.mock.calls.length === 2) signals.emit("SIGTERM");
    });

    await expect(runContinuousWorker<typeof emptyResult>({
      workerName: "test_worker",
      createRuntime,
      pollMilliseconds: 2_000,
      summarize: (result) => result,
      delay,
      signals,
      logger: operationalLogger,
    })).resolves.toBe(0);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(delay.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([2_000, 2_000]);
    expect(createRuntime).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(signals.listenerCount()).toBe(0);
    expect(operationalLogger.info).not.toHaveBeenCalledWith(expect.stringContaining("iteration_completed"));
  });

  it.each(["SIGINT", "SIGTERM"] as const)("lets the active iteration finish after %s", async (signal) => {
    const signals = new FakeShutdownSignals();
    let markStarted: (() => void) | undefined;
    let finish: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const execute = vi.fn(() => new Promise<typeof emptyResult>((resolve) => {
      finish = () => { resolve(emptyResult); };
      markStarted?.();
    }));
    const close = vi.fn().mockResolvedValue(undefined);
    const delay = vi.fn();
    const operationalLogger = logger();
    const running = runContinuousWorker({
      workerName: "test_worker",
      createRuntime: () => ({worker: {execute}, close}),
      pollMilliseconds: 2_000,
      summarize: (result) => result,
      delay,
      signals,
      logger: operationalLogger,
    });

    await started;
    signals.emit(signal);
    finish?.();

    await expect(running).resolves.toBe(0);
    expect(execute).toHaveBeenCalledOnce();
    expect(delay).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(operationalLogger.info).toHaveBeenCalledWith(JSON.stringify({event: "test_worker_stopping", signal}));
    expect(operationalLogger.info).toHaveBeenCalledWith(JSON.stringify({event: "test_worker_stopped"}));
  });

  it("backs off repeated unexpected failures and never logs their details", async () => {
    const signals = new FakeShutdownSignals();
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error("postgresql://secret@example.test/yolpol"))
      .mockRejectedValueOnce(new Error("123456:BOT_SECRET_SENTINEL"))
      .mockResolvedValueOnce(emptyResult);
    const operationalLogger = logger();
    const delay = vi.fn(async (milliseconds: number, signal: AbortSignal) => {
      void milliseconds;
      void signal;
      if (delay.mock.calls.length === 3) signals.emit("SIGINT");
    });

    await runContinuousWorker<typeof emptyResult>({
      workerName: "test_worker",
      createRuntime: () => ({worker: {execute}, close: vi.fn().mockResolvedValue(undefined)}),
      pollMilliseconds: 2_000,
      summarize: (result) => result,
      delay,
      signals,
      logger: operationalLogger,
    });

    expect(delay.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([5_000, 10_000, 2_000]);
    expect(JSON.stringify(operationalLogger.error.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(operationalLogger.error.mock.calls)).not.toContain("BOT_SECRET_SENTINEL");
  });

  it("fails fast with a redacted event for invalid polling or startup configuration", async () => {
    const signals = new FakeShutdownSignals();
    const operationalLogger = logger();
    const createRuntime = vi.fn(() => { throw new Error("postgresql://private@example.test/yolpol"); });

    await expect(runConfiguredContinuousWorker({
      workerName: "test_worker",
      environment: {TEST_WORKER_POLL_MS: "fast"},
      pollEnvironmentVariable: "TEST_WORKER_POLL_MS",
      createRuntime,
      summarize: (result: typeof emptyResult) => result,
      signals,
      logger: operationalLogger,
    })).resolves.toBe(1);
    expect(createRuntime).not.toHaveBeenCalled();

    await expect(runConfiguredContinuousWorker({
      workerName: "test_worker",
      environment: {},
      pollEnvironmentVariable: "TEST_WORKER_POLL_MS",
      createRuntime,
      summarize: (result: typeof emptyResult) => result,
      signals,
      logger: operationalLogger,
    })).resolves.toBe(1);
    expect(createRuntime).toHaveBeenCalledOnce();
    expect(JSON.stringify(operationalLogger.error.mock.calls)).not.toContain("private@example.test");
    expect(signals.listenerCount()).toBe(0);
  });

  it("returns non-zero when shutdown resource cleanup fails", async () => {
    const signals = new FakeShutdownSignals();
    const delay = vi.fn(async () => { signals.emit("SIGTERM"); });
    const operationalLogger = logger();

    await expect(runContinuousWorker({
      workerName: "test_worker",
      createRuntime: () => ({worker: {execute: async () => emptyResult}, close: async () => { throw new Error("private"); }}),
      pollMilliseconds: 2_000,
      summarize: (result) => result,
      delay,
      signals,
      logger: operationalLogger,
    })).resolves.toBe(1);
    expect(operationalLogger.error).toHaveBeenCalledWith(JSON.stringify({event: "test_worker_shutdown_failed"}));
  });

  it("validates bounded integer polling and caps failure backoff", () => {
    expect(readWorkerPollMilliseconds({environment: {}, environmentVariable: "WORKER_POLL_MS"})).toBe(2_000);
    expect(readWorkerPollMilliseconds({environment: {WORKER_POLL_MS: "2500"}, environmentVariable: "WORKER_POLL_MS"})).toBe(2_500);
    for (const invalid of ["0", "499", "60001", "1.5", "fast", "-1"]) {
      expect(() => readWorkerPollMilliseconds({environment: {WORKER_POLL_MS: invalid}, environmentVariable: "WORKER_POLL_MS"})).toThrow(
        "WORKER_POLL_MS is invalid.",
      );
    }
    expect(workerFailureDelayMilliseconds(2_000, 1)).toBe(5_000);
    expect(workerFailureDelayMilliseconds(2_000, 2)).toBe(10_000);
    expect(workerFailureDelayMilliseconds(60_000, 10)).toBe(60_000);
  });
});
