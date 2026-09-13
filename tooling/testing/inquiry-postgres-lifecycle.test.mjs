import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {EventEmitter} from "node:events";
import {afterEach, describe, expect, it} from "vitest";
import {acquireLifecycleLock, assertSafeCleanupArguments, cleanupArguments, createCommandRunner, createIdempotentCleanup, integrationDatabaseUrl, LifecycleLockedError, lifecycleLockPath} from "./inquiry-postgres-lifecycle.mjs";

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, {recursive: true, force: true}))); });
async function temporaryDirectory() { const path = await mkdtemp(resolve(tmpdir(), "yolpol-lifecycle-test-")); directories.push(path); return path; }

describe("Inquiry PostgreSQL lifecycle lock", () => {
  it("uses the Compose test defaults when no overrides are supplied", () => {
    expect(integrationDatabaseUrl({})).toBe("postgresql://yolpol_test:local-integration-only@127.0.0.1:55432/yolpol_integration");
  });

  it("uses the release password override while keeping the integration host fixed", () => {
    expect(integrationDatabaseUrl({
      POSTGRES_TEST_PORT: "55432",
      POSTGRES_TEST_DB: "yolpol_integration",
      POSTGRES_TEST_USER: "yolpol_test",
      POSTGRES_TEST_PASSWORD: "release-validation-only",
    })).toBe("postgresql://yolpol_test:release-validation-only@127.0.0.1:55432/yolpol_integration");
  });

  it("encodes connection components and rejects port injection", () => {
    expect(integrationDatabaseUrl({
      POSTGRES_TEST_PORT: "55433",
      POSTGRES_TEST_DB: "integration/name",
      POSTGRES_TEST_USER: "test@user",
      POSTGRES_TEST_PASSWORD: "p:a ss!'",
    })).toBe("postgresql://test%40user:p%3Aa%20ss%21%27@127.0.0.1:55433/integration%2Fname");
    expect(() => integrationDatabaseUrl({POSTGRES_TEST_PORT: "55432@remote.example"})).toThrow(/integer/u);
    expect(() => integrationDatabaseUrl({POSTGRES_TEST_PORT: "65536"})).toThrow(/integer/u);
  });

  it("acquires atomically and rejects an active concurrent owner", async () => {
    const directory = await temporaryDirectory();
    const first = acquireLifecycleLock({repositoryPath: "repo", temporaryDirectory: directory, pid: 10, isAlive: () => true, token: "first"});
    expect(() => acquireLifecycleLock({repositoryPath: "repo", temporaryDirectory: directory, pid: 11, isAlive: () => true, token: "second"})).toThrow(LifecycleLockedError);
    expect(existsSync(first.path)).toBe(true); first.release();
  });
  it("releases its lock idempotently", async () => {
    const directory = await temporaryDirectory(); const lock = acquireLifecycleLock({repositoryPath: "repo", temporaryDirectory: directory, token: "owned"});
    lock.release(); lock.release(); expect(existsSync(lock.path)).toBe(false);
  });
  it("recovers a confirmed dead owner but never deletes an uncertain lock", async () => {
    const directory = await temporaryDirectory(); const path = lifecycleLockPath("repo", directory);
    mkdirSync(path); writeFileSync(resolve(path, "owner.json"), JSON.stringify({pid: 20, token: "stale"}));
    const recovered = acquireLifecycleLock({repositoryPath: "repo", temporaryDirectory: directory, isAlive: () => false, token: "new"}); recovered.release();
    mkdirSync(path); expect(() => acquireLifecycleLock({repositoryPath: "repo", temporaryDirectory: directory, isAlive: () => false})).toThrow(LifecycleLockedError); expect(existsSync(path)).toBe(true);
  });
  it("permits only the narrow postgres-test cleanup command", () => {
    expect(() => assertSafeCleanupArguments(cleanupArguments)).not.toThrow();
    for (const unsafe of [["compose", "down"], [...cleanupArguments, "-v"], ["docker", "system", "prune"]]) expect(() => assertSafeCleanupArguments(unsafe)).toThrow();
  });
  it("runs idempotent cleanup only once", async () => {
    let calls = 0; const cleanup = createIdempotentCleanup(async () => { calls += 1; });
    await Promise.all([cleanup(), cleanup(), cleanup()]); expect(calls).toBe(1);
  });
  it.each([["SIGINT", 130], ["SIGTERM", 143]])("handles %s once and terminates only its active child", async (signal, expectedCode) => {
    const kills = [];
    const child = Object.assign(new EventEmitter(), {exitCode: null, stdout: undefined, stderr: undefined, kill(received) { kills.push(received); this.exitCode = 1; this.emit("exit", 1, received); return true; }});
    const runner = createCommandRunner({spawnProcess: () => child, terminationTimeoutMs: 5});
    const running = runner.run("node", ["fixture"]);
    expect(runner.interrupt(signal)).toBe(true); expect(runner.interrupt(signal)).toBe(false);
    await expect(running).rejects.toThrow("exited unsuccessfully");
    expect(runner.interruptionCode).toBe(expectedCode); expect(kills).toEqual(["SIGTERM"]);
  });
});
