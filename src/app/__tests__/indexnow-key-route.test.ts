import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {afterEach, describe, expect, it, vi} from "vitest";

import {GET} from "@/app/indexnow-key.txt/route";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

function configure(environment: "production" | "staging", origin: string) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("YOLPOL_DEPLOYMENT_ENVIRONMENT", environment);
  vi.stubEnv("YOLPOL_APP_ORIGIN", origin);
}

async function syntheticKeyFile(content = "synthetic-key-123\n"): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "yolpol-indexnow-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "indexnow-key");
  await writeFile(path, content, {encoding: "utf8", mode: 0o600});
  return path;
}

describe("root IndexNow key verification route", () => {
  it("returns exactly the validated Production key as UTF-8 text", async () => {
    configure("production", "https://yolpol.com");
    vi.stubEnv("INDEXNOW_KEY_FILE", await syntheticKeyFile());

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("synthetic-key-123");
  });

  it("does not expose the Production key in Staging", async () => {
    configure("staging", "https://staging.yolpol.com");
    vi.stubEnv("INDEXNOW_KEY_FILE", await syntheticKeyFile());

    const response = await GET();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it.each([
    ["missing", undefined],
    ["malformed", "invalid_key\n"],
  ])("fails closed for a %s key", async (_name, content) => {
    configure("production", "https://yolpol.com");
    if (content !== undefined) vi.stubEnv("INDEXNOW_KEY_FILE", await syntheticKeyFile(content));

    const response = await GET();
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).toBe("Service Unavailable");
    expect(body).not.toMatch(/INDEXNOW|invalid_key|yolpol-indexnow-/u);
  });
});
