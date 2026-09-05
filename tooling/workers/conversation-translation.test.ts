import {readFileSync} from "node:fs";
import {describe, expect, it, vi} from "vitest";
import {runConversationTranslationWorkerOneShot} from "./conversation-translation-runtime";

describe("Conversation translation worker boundaries", () => {
  it("keeps production environment-based and loads development env before composition", () => {
    const production = readFileSync("tooling/workers/conversation-translation.ts", "utf8");
    const development = readFileSync("tooling/workers/conversation-translation-dev.ts", "utf8");
    const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as {scripts: Record<string, string>}).scripts;
    expect(production).not.toContain("loadDevelopmentEnv");
    expect(development.indexOf("loadDevelopmentEnv();")).toBeLessThan(development.indexOf('await import("../../src/composition'));
    expect(scripts["worker:conversation-translation"]).toContain("tooling/workers/conversation-translation.ts");
    expect(scripts["dev:conversation-translation"]).toContain("tooling/workers/conversation-translation-dev.ts");
    expect(scripts.dev).toBe("next dev");
  });
  it("closes resources and logs only aggregate counters or a generic error", async () => {
    const close = vi.fn().mockResolvedValue(undefined); const info = vi.fn(); const error = vi.fn();
    expect(await runConversationTranslationWorkerOneShot({createRuntime: () => ({close, worker: {execute: async () => ({claimed: 1, succeeded: 1, failed: 0, skipped: 0})}}), logger: {info, error}})).toBe(0);
    expect(info).toHaveBeenCalledWith('{"claimed":1,"succeeded":1,"failed":0,"skipped":0}');
    expect(close).toHaveBeenCalledOnce();
    expect(await runConversationTranslationWorkerOneShot({createRuntime: () => ({close, worker: {execute: async () => { throw new Error("Private content must not be logged"); }}}), logger: {info, error}})).toBe(1);
    expect(error).toHaveBeenCalledExactlyOnceWith("Conversation translation worker failed.");
    expect(close).toHaveBeenCalledTimes(2);
  });
});
