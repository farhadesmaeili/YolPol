import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {EventEmitter} from "node:events";
import {afterEach, describe, expect, it} from "vitest";
import {acquireLifecycleLock, assertSafeCleanupArguments, cleanupArguments, createCommandRunner, createIdempotentCleanup, LifecycleLockedError, lifecycleLockPath} from "./inquiry-postgres-lifecycle.mjs";

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, {recursive: true, force: true}))); });
async function temporaryDirectory() { const path = await mkdtemp(resolve(tmpdir(), "yolpol-lifecycle-test-")); directories.push(path); return path; }

describe("Inquiry PostgreSQL lifecycle lock", () => {
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
