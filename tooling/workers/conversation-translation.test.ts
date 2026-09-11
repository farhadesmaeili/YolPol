import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";
import {runConversationTranslationWorkerCommand, runConversationTranslationWorkerOneShot} from "./conversation-translation-runtime";

class FakeSignals {
  private readonly listeners = new Map<"SIGINT" | "SIGTERM", Set<() => void>>();
  on(signal: "SIGINT" | "SIGTERM", listener: () => void): void { const values = this.listeners.get(signal) ?? new Set(); values.add(listener); this.listeners.set(signal, values); }
  off(signal: "SIGINT" | "SIGTERM", listener: () => void): void { this.listeners.get(signal)?.delete(listener); }
  emit(signal: "SIGINT" | "SIGTERM"): void { for (const listener of this.listeners.get(signal) ?? []) listener(); }
}

describe("Conversation translation worker boundaries", () => {
  it("keeps production environment-based and loads development env before composition", () => {
    const production = readFileSync("tooling/workers/conversation-translation.ts", "utf8");
    const development = readFileSync("tooling/workers/conversation-translation-dev.ts", "utf8");
    const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as {scripts: Record<string, string>}).scripts;
    expect(production).not.toContain("loadDevelopmentEnv");
    expect(development.indexOf("loadDevelopmentEnv();")).toBeLessThan(development.indexOf('await import("../../src/composition'));
    expect(scripts["worker:conversation-translation"]).toBe("node --conditions=react-server --import tsx tooling/workers/conversation-translation.ts");
    expect(scripts["worker:conversation-translation:once"]).toBe("node --conditions=react-server --import tsx tooling/workers/conversation-translation-once.ts");
    expect(scripts["dev:conversation-translation"]).toBe("node --conditions=react-server --import tsx tooling/workers/conversation-translation-dev.ts");
    expect(scripts.dev).toBe("next dev");
  });
  it("runs the existing bounded translation batch in the production loop", async () => {
    const signals = new FakeSignals();
    const execute = vi.fn().mockResolvedValue({claimed: 1, succeeded: 1, failed: 0, skipped: 0});
    const close = vi.fn().mockResolvedValue(undefined);
    const delay = vi.fn(async () => { signals.emit("SIGTERM"); });

    await expect(runConversationTranslationWorkerCommand({
      environment: {}, createRuntime: () => ({worker: {execute}, close}), delay, signals, logger: {info: vi.fn(), error: vi.fn()},
    })).resolves.toBe(0);

    expect(execute).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it("closes resources and logs only aggregate counters or a generic error", async () => {
    const close = vi.fn().mockResolvedValue(undefined); const info = vi.fn(); const error = vi.fn();
    expect(await runConversationTranslationWorkerOneShot({createRuntime: () => ({close, worker: {execute: async () => ({claimed: 1, succeeded: 1, failed: 0, skipped: 0})}}), logger: {info, error}})).toBe(0);
    expect(info).toHaveBeenCalledWith("worker.once_completed", {
      worker: "conversation_translation_worker",
      claimed: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
    });
    expect(close).toHaveBeenCalledOnce();
    expect(await runConversationTranslationWorkerOneShot({createRuntime: () => ({close, worker: {execute: async () => { throw new Error("Private content must not be logged"); }}}), logger: {info, error}})).toBe(1);
    expect(error).toHaveBeenCalledExactlyOnceWith("worker.once_failed", {worker: "conversation_translation_worker"});
    expect(close).toHaveBeenCalledTimes(2);
  });
});
