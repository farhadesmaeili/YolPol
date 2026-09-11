import {createRequire} from "node:module";
import {dirname, resolve} from "node:path";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it, vi} from "vitest";
import {runConversationAiFallbackWorkerCommand} from "./conversation-ai-fallback-runtime";

interface EsbuildTransform {
  transformSync(source: string, options: {format: "cjs"; loader: "ts"; platform: "node"}): {code: string};
}

const require = createRequire(import.meta.url);
const requireFromTsx = createRequire(require.resolve("tsx/package.json"));
const esbuild = requireFromTsx("esbuild") as EsbuildTransform;
const repositoryPath = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const productionEntrypoint = resolve(repositoryPath, "tooling/workers/conversation-ai-fallback.ts");
const developmentEntrypoint = resolve(repositoryPath, "tooling/workers/conversation-ai-fallback-dev.ts");

describe("Conversation AI fallback worker entrypoints", () => {
  it("keeps the production worker independent from local environment files", () => {
    const packageJson = JSON.parse(readFileSync(resolve(repositoryPath, "package.json"), "utf8")) as {scripts?: Record<string, string>};
    const source = readFileSync(productionEntrypoint, "utf8");

    expect(packageJson.scripts?.["worker:ai-fallback"]).toBe("node --conditions=react-server --import tsx tooling/workers/conversation-ai-fallback.ts");
    expect(packageJson.scripts?.["worker:ai-fallback:once"]).toBe("node --conditions=react-server --import tsx tooling/workers/conversation-ai-fallback-once.ts");
    expect(source).not.toContain("loadDevelopmentEnv");
  });

  it("loads development env before dynamically importing worker composition", () => {
    const packageJson = JSON.parse(readFileSync(resolve(repositoryPath, "package.json"), "utf8")) as {scripts?: Record<string, string>};
    const source = readFileSync(developmentEntrypoint, "utf8");
    const transformed = esbuild.transformSync(source, {format: "cjs", loader: "ts", platform: "node"});

    expect(packageJson.scripts?.["dev:ai-fallback"]).toBe("node --conditions=react-server --import tsx tooling/workers/conversation-ai-fallback-dev.ts");
    expect(source).not.toMatch(/^import .*conversation-ai-fallback-runtime/mu);
    expect(source).not.toMatch(/^import .*composition\/conversation-ai-routing\/conversation-ai-worker/mu);
    const loadIndex = source.indexOf("loadDevelopmentEnv();");
    expect(loadIndex).toBeGreaterThanOrEqual(0);
    expect(loadIndex).toBeLessThan(source.indexOf('await import("./conversation-ai-fallback-runtime")'));
    expect(loadIndex).toBeLessThan(source.indexOf('await import("../../src/composition/conversation-ai-routing/conversation-ai-worker")'));
    expect(transformed.code).toContain("main().catch");
  });

  it("runs the existing bounded AI fallback batch in the production loop", async () => {
    const listeners = new Map<"SIGINT" | "SIGTERM", Set<() => void>>();
    const signals = {
      on: (signal: "SIGINT" | "SIGTERM", listener: () => void) => { const values = listeners.get(signal) ?? new Set(); values.add(listener); listeners.set(signal, values); },
      off: (signal: "SIGINT" | "SIGTERM", listener: () => void) => { listeners.get(signal)?.delete(listener); },
    };
    const execute = vi.fn().mockResolvedValue({claimed: 1, succeeded: 0, cancelled: 1, superseded: 0, failed: 0});
    const close = vi.fn().mockResolvedValue(undefined);
    const delay = vi.fn(async () => { for (const listener of listeners.get("SIGINT") ?? []) listener(); });

    await expect(runConversationAiFallbackWorkerCommand({
      environment: {}, createRuntime: () => ({worker: {execute}, close}), delay, signals, logger: {info: vi.fn(), error: vi.fn()},
    })).resolves.toBe(0);

    expect(execute).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
