import {createRequire} from "node:module";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {acquireLifecycleLock, assertSafeCleanupArguments, cleanupArguments, createCommandRunner, createIdempotentCleanup, integrationService} from "./inquiry-postgres-lifecycle.mjs";

const require = createRequire(import.meta.url);
const repositoryPath = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const vitestCli = resolve(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const composePrefix = ["compose", "--project-directory", repositoryPath, "--profile", "integration"];
const integrationUrl = "postgresql://yolpol_test:local-integration-only@127.0.0.1:55432/yolpol_integration";
const runner = createCommandRunner({cwd: repositoryPath});
const lock = acquireLifecycleLock({repositoryPath});
const cleanupAction = () => {
  assertSafeCleanupArguments(cleanupArguments);
  return runner.run("docker", ["compose", "--project-directory", repositoryPath, ...cleanupArguments.slice(1)], {allowInterrupted: true});
};
let cleanup = createIdempotentCleanup(cleanupAction);
const signalHandlers = new Map();
for (const signal of ["SIGINT", "SIGTERM"]) {
  const handler = () => { runner.interrupt(signal); };
  signalHandlers.set(signal, handler); process.on(signal, handler);
}

let exitCode = 1;
try {
  const resolved = JSON.parse(await runner.run("docker", [...composePrefix, "config", "--format", "json"], {capture: true}));
  const developmentMounts = resolved.services?.postgres?.volumes ?? [];
  const integrationMounts = resolved.services?.[integrationService]?.volumes ?? [];
  const integrationTmpfs = resolved.services?.[integrationService]?.tmpfs ?? [];
  const developmentData = developmentMounts.find(({target}) => target === "/var/lib/postgresql/data");
  if (developmentData?.type !== "volume" || developmentData.source !== "postgres_data") throw new Error("Development PostgreSQL must retain its named data volume.");
  if (!integrationTmpfs.includes("/var/lib/postgresql/data") || integrationMounts.some(({target}) => target === "/var/lib/postgresql/data")) throw new Error("Integration PostgreSQL must use tmpfs storage.");
  await cleanup();
  cleanup = createIdempotentCleanup(cleanupAction);
  await runner.run("docker", [...composePrefix, "up", "-d", "--wait", "--wait-timeout", "60", integrationService]);
  await runner.run(process.execPath, [vitestCli, "run", "--config", "vitest.integration.config.mts"], {env: {...process.env, INTEGRATION_DATABASE_URL: integrationUrl}});
  exitCode = 0;
} catch (error) {
  if (!runner.interrupted) console.error(error instanceof Error ? error.message : "Integration lifecycle failed.");
} finally {
  try { await runner.terminateActiveChild(); await cleanup(); }
  catch { exitCode = 1; }
  try { lock.release(); } catch { exitCode = 1; }
  for (const [signal, handler] of signalHandlers) process.off(signal, handler);
}

process.exitCode = runner.interruptionCode ?? exitCode;
