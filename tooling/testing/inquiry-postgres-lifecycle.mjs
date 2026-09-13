import {spawn} from "node:child_process";
import {createHash, randomUUID} from "node:crypto";
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";

export const integrationService = "postgres-test";
export const cleanupArguments = ["compose", "--profile", "integration", "rm", "-sf", integrationService];

export class LifecycleLockedError extends Error {
  constructor(lockPath) {
    super(`Inquiry PostgreSQL integration is already running or its lock is uncertain. Inspect and manually remove this lock only after confirming no runner is active: ${lockPath}`);
    this.name = "LifecycleLockedError";
  }
}

function processIsAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== "ESRCH"; }
}

export function lifecycleLockPath(repositoryPath, temporaryDirectory = tmpdir()) {
  const identity = createHash("sha256").update(`${resolve(repositoryPath)}:${integrationService}`).digest("hex").slice(0, 24);
  return resolve(temporaryDirectory, `yolpol-inquiry-postgres-${identity}.lock`);
}

export function acquireLifecycleLock({repositoryPath, temporaryDirectory, pid = process.pid, isAlive = processIsAlive, token = randomUUID()} = {}) {
  const lockPath = lifecycleLockPath(repositoryPath, temporaryDirectory);
  const ownerPath = resolve(lockPath, "owner.json");
  try { mkdirSync(lockPath); }
  catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let owner;
    try { owner = JSON.parse(readFileSync(ownerPath, "utf8")); }
    catch { throw new LifecycleLockedError(lockPath); }
    if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || isAlive(owner.pid)) throw new LifecycleLockedError(lockPath);
    const stalePath = `${lockPath}.stale-${token}`;
    try { renameSync(lockPath, stalePath); }
    catch { throw new LifecycleLockedError(lockPath); }
    rmSync(stalePath, {recursive: true});
    try { mkdirSync(lockPath); }
    catch { throw new LifecycleLockedError(lockPath); }
  }
  try { writeFileSync(ownerPath, JSON.stringify({pid, startedAt: new Date().toISOString(), token}), {flag: "wx"}); }
  catch (error) { rmSync(lockPath, {recursive: true}); throw error; }
  let released = false;
  return {
    path: lockPath,
    release() {
      if (released) return;
      let owner;
      try { owner = JSON.parse(readFileSync(ownerPath, "utf8")); }
      catch { throw new LifecycleLockedError(lockPath); }
      if (owner.token !== token) throw new LifecycleLockedError(lockPath);
      rmSync(lockPath, {recursive: true});
      released = true;
    },
  };
}

export function assertSafeCleanupArguments(args) {
  if (args.join(" ") !== cleanupArguments.join(" ") || args.some((value) => value === "down" || value === "-v" || value.includes("prune"))) throw new Error("Unsafe integration cleanup command.");
}

export function createIdempotentCleanup(cleanupAction) {
  let cleanupPromise;
  return () => { cleanupPromise ??= Promise.resolve().then(cleanupAction); return cleanupPromise; };
}

export function createCommandRunner({cwd, environment = process.env, spawnProcess = spawn, terminationTimeoutMs = 5_000} = {}) {
  let active;
  let interrupted = false;
  let interruptionCode;
  let terminationPromise;
  const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
  function terminateActiveChild() {
    if (terminationPromise) return terminationPromise;
    const child = active;
    if (!child || child.exitCode !== null) return Promise.resolve();
    terminationPromise = (async () => {
      child.kill("SIGTERM");
      await Promise.race([child.exited, delay(terminationTimeoutMs)]);
      if (child.exitCode === null) { child.kill("SIGKILL"); await Promise.race([child.exited, delay(2_000)]); }
    })().finally(() => { terminationPromise = undefined; });
    return terminationPromise;
  }
  async function run(command, args, {capture = false, allowInterrupted = false, env = environment} = {}) {
    if (interrupted && !allowInterrupted) throw new Error("Integration lifecycle interrupted.");
    const child = spawnProcess(command, args, {cwd, env, shell: false, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"});
    let stdout = ""; let stderr = "";
    if (capture) { child.stdout?.on("data", (chunk) => { stdout += chunk; }); child.stderr?.on("data", (chunk) => { stderr += chunk; }); }
    child.exited = new Promise((resolveExit, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolveExit({code, signal})); });
    active = child;
    try {
      const result = await child.exited;
      if (result.code !== 0) throw new Error(`${command} exited unsuccessfully.${capture && stderr ? ` ${stderr.trim()}` : ""}`);
      return stdout;
    } finally { if (active === child) active = undefined; }
  }
  return {
    run,
    interrupt(signal) { if (interrupted) return false; interrupted = true; interruptionCode = signal === "SIGINT" ? 130 : 143; void terminateActiveChild(); return true; },
    terminateActiveChild,
    get interruptionCode() { return interruptionCode; },
    get interrupted() { return interrupted; },
  };
}
