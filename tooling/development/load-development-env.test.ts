import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {resetEnv} from "@next/env";
import {afterAll, describe, expect, it, vi} from "vitest";

import {loadDevelopmentEnv} from "./load-development-env";

const testKeys = [
  "YOLPOL_ENV_LOADER_BASE_TEST",
  "YOLPOL_ENV_LOADER_OVERRIDE_TEST",
  "YOLPOL_ENV_LOADER_PROCESS_TEST",
  "YOLPOL_ENV_LOADER_SECRET_TEST",
] as const;
const originalNodeEnvironment = process.env.NODE_ENV;
const originalValues = Object.fromEntries(testKeys.map((key) => [key, process.env[key]]));

function setNodeEnvironment(value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
  else Reflect.set(process.env, "NODE_ENV", value);
}

afterAll(() => {
  resetEnv();
  setNodeEnvironment(originalNodeEnvironment);
  for (const key of testKeys) {
    const originalValue = originalValues[key];
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  }
});

describe("loadDevelopmentEnv", () => {
  it("loads Next-compatible local development files while preserving process values", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "yolpol-development-env-"));
    const fakeSecret = "fake-development-secret-never-log";
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    writeFileSync(join(projectDirectory, ".env"), [
      "YOLPOL_ENV_LOADER_BASE_TEST=base",
      "YOLPOL_ENV_LOADER_OVERRIDE_TEST=base",
      "YOLPOL_ENV_LOADER_PROCESS_TEST=file",
    ].join("\n"));
    writeFileSync(join(projectDirectory, ".env.local"), [
      "YOLPOL_ENV_LOADER_OVERRIDE_TEST=local",
      `YOLPOL_ENV_LOADER_SECRET_TEST=${fakeSecret}`,
    ].join("\n"));
    setNodeEnvironment("development");
    process.env.YOLPOL_ENV_LOADER_PROCESS_TEST = "process";

    try {
      loadDevelopmentEnv({projectDirectory});

      expect(process.env.YOLPOL_ENV_LOADER_BASE_TEST).toBe("base");
      expect(process.env.YOLPOL_ENV_LOADER_OVERRIDE_TEST).toBe("local");
      expect(process.env.YOLPOL_ENV_LOADER_PROCESS_TEST).toBe("process");
      expect(process.env.YOLPOL_ENV_LOADER_SECRET_TEST).toBe(fakeSecret);
      expect(consoleSpies.flatMap((spy) => spy.mock.calls).flat().join(" ")).not.toContain(fakeSecret);
    } finally {
      for (const spy of consoleSpies) spy.mockRestore();
      rmSync(projectDirectory, {recursive: true, force: true});
    }
  });

  it("does not load repository files for production tooling", () => {
    const loadEnvironment = vi.fn();

    loadDevelopmentEnv({environment: {NODE_ENV: "production"}, loadEnvironment});

    expect(loadEnvironment).not.toHaveBeenCalled();
  });
});
