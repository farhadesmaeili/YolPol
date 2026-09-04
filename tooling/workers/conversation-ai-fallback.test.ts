import {createRequire} from "node:module";
import {dirname, resolve} from "node:path";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

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

    expect(packageJson.scripts?.["worker:ai-fallback"]).toBe("pnpm exec tsx tooling/workers/conversation-ai-fallback.ts");
    expect(source).not.toContain("loadDevelopmentEnv");
  });

  it("loads development env before dynamically importing worker composition", () => {
    const packageJson = JSON.parse(readFileSync(resolve(repositoryPath, "package.json"), "utf8")) as {scripts?: Record<string, string>};
    const source = readFileSync(developmentEntrypoint, "utf8");
    const transformed = esbuild.transformSync(source, {format: "cjs", loader: "ts", platform: "node"});

    expect(packageJson.scripts?.["dev:ai-fallback"]).toBe("pnpm exec tsx tooling/workers/conversation-ai-fallback-dev.ts");
    expect(source).not.toMatch(/^import .*conversation-ai-fallback-runtime/mu);
    expect(source).not.toMatch(/^import .*composition\/conversation-ai-routing\/conversation-ai-worker/mu);
    const loadIndex = source.indexOf("loadDevelopmentEnv();");
    expect(loadIndex).toBeGreaterThanOrEqual(0);
    expect(loadIndex).toBeLessThan(source.indexOf('await import("./conversation-ai-fallback-runtime")'));
    expect(loadIndex).toBeLessThan(source.indexOf('await import("../../src/composition/conversation-ai-routing/conversation-ai-worker")'));
    expect(transformed.code).toContain("main().catch");
  });
});
