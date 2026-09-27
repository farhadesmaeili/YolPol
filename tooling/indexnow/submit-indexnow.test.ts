import {spawnSync} from "node:child_process";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("Production IndexNow entrypoint", () => {
  it("starts through the Production Node and tsx execution contract", () => {
    const result = spawnSync(process.execPath, [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tooling/indexnow/submit-indexnow.ts",
      "synthetic-argument",
    ], {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 20_000,
    });

    expect(result.status, result.stderr).toBe(64);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe('{"event":"indexnow.submission.failed","result":"failed","reason":"unexpected_arguments"}\n');
    expect(result.stderr).not.toContain("Top-level await");
  });
});
