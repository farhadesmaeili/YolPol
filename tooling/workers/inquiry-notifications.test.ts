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
const entrypoint = resolve(repositoryPath, "tooling/workers/inquiry-notifications.ts");
const developmentEntrypoint = resolve(repositoryPath, "tooling/workers/inquiry-notifications-dev.ts");

describe("Inquiry notification worker entrypoint", () => {
  it("accepts the configured runner's CommonJS transformation", () => {
    const packageJson = JSON.parse(readFileSync(resolve(repositoryPath, "package.json"), "utf8")) as {scripts?: Record<string, string>};
    expect(packageJson.scripts?.["worker:inquiry-notifications"]).toBe("pnpm exec tsx tooling/workers/inquiry-notifications.ts");

    const source = readFileSync(entrypoint, "utf8");
    const transformed = esbuild.transformSync(source, {format: "cjs", loader: "ts", platform: "node"});

    expect(source).toMatch(/async function main\(\): Promise<void>/u);
    expect(source).not.toContain("loadDevelopmentEnv");
    expect(transformed.code).toContain("main().catch");
  });

  it("keeps a separate CommonJS-compatible development polling entrypoint", () => {
    const packageJson = JSON.parse(readFileSync(resolve(repositoryPath, "package.json"), "utf8")) as {scripts?: Record<string, string>};
    expect(packageJson.scripts?.["dev:inquiry-notifications"]).toBe("pnpm exec tsx tooling/workers/inquiry-notifications-dev.ts");

    const source = readFileSync(developmentEntrypoint, "utf8");
    const transformed = esbuild.transformSync(source, {format: "cjs", loader: "ts", platform: "node"});

    expect(source).toMatch(/async function main\(\): Promise<void>/u);
    expect(source).toContain("runInquiryNotificationDevelopmentCommand");
    expect(source).not.toMatch(/^import .*inquiry-notification-runtime/mu);
    expect(source).not.toMatch(/^import .*composition\/inquiries\/inquiry-notification-worker/mu);
    const loadIndex = source.indexOf("loadDevelopmentEnv();");
    expect(loadIndex).toBeGreaterThanOrEqual(0);
    expect(loadIndex).toBeLessThan(source.indexOf('await import("./inquiry-notification-runtime")'));
    expect(loadIndex).toBeLessThan(source.indexOf('await import("../../src/composition/inquiries/inquiry-notification-worker")'));
    expect(transformed.code).toContain("main().catch");
  });
});
