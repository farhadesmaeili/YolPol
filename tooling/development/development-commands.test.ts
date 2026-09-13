import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";

describe("development commands", () => {
  it("exposes a LAN-capable Next development command without changing the default", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {scripts?: Record<string, string>};

    expect(packageJson.scripts?.dev).toBe("next dev");
    expect(packageJson.scripts?.["dev:host"]).toBe("next dev -H 0.0.0.0");
  });

  it("loads development env before Drizzle reads DATABASE_URL", () => {
    const source = readFileSync(resolve("drizzle.config.ts"), "utf8");

    expect(source.indexOf("loadDevelopmentEnv();")).toBeGreaterThanOrEqual(0);
    expect(source.indexOf("loadDevelopmentEnv();")).toBeLessThan(source.indexOf("process.env.DATABASE_URL"));
    expect(source).not.toContain(".env.local");
  });
});
