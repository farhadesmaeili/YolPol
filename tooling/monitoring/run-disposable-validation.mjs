import {execFileSync} from "node:child_process";
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const project = "yolpol-monitoring-validation-0059";
const prefix = `${project}-fixture`;
const edgeNetwork = `${prefix}-edge`;
const backendNetwork = `${prefix}-backend`;
const postgresContainer = `${prefix}-postgres`;
const webContainer = `${prefix}-web`;
const operationsImage = "yolpol-operations-metrics:validation-0059";
const migrationImage = "yolpol-migrations:validation-0059";
const composeFile = resolve("deploy/monitoring/compose.yaml");
const validationComposeFile = resolve("deploy/monitoring/compose.docker-desktop-validation.yaml");
const fixtureDirectory = mkdtempSync(join(tmpdir(), `${prefix}-`));
const secretsDirectory = join(fixtureDirectory, "secrets");
const backupsDirectory = join(fixtureDirectory, "backups");

mkdirSync(secretsDirectory);
mkdirSync(backupsDirectory);

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: resolve("."),
  encoding: "utf8",
  stdio: options.capture ? "pipe" : "inherit",
  ...options,
});

const docker = (args, options) => run("docker", args, options);
const composeEnvironment = {
  ...process.env,
  YOLPOL_OPERATIONS_METRICS_IMAGE: "yolpol-operations-metrics:local",
  YOLPOL_MONITORING_BIND_ADDRESS: "127.0.0.1",
  YOLPOL_PROMETHEUS_PORT: "19090",
  YOLPOL_ALERTMANAGER_PORT: "19093",
  YOLPOL_MONITORING_STAGING_EDGE_NETWORK: edgeNetwork,
  YOLPOL_MONITORING_STAGING_BACKEND_NETWORK: backendNetwork,
  YOLPOL_ALERTMANAGER_CONFIG_FILE: resolve("deploy/monitoring/alertmanager/alertmanager.local.yml"),
  YOLPOL_MONITORING_TELEGRAM_BOT_TOKEN_FILE: join(secretsDirectory, "telegram-token"),
  YOLPOL_MONITORING_TELEGRAM_CHAT_ID_FILE: join(secretsDirectory, "telegram-chat-id"),
  YOLPOL_MONITORING_STAGING_POSTGRES_URI_FILE: join(secretsDirectory, "postgres-uri"),
  YOLPOL_MONITORING_STAGING_POSTGRES_USER_FILE: join(secretsDirectory, "postgres-user"),
  YOLPOL_MONITORING_STAGING_POSTGRES_PASSWORD_FILE: join(secretsDirectory, "postgres-password"),
  YOLPOL_MONITORING_STAGING_OPERATIONS_DATABASE_URL_FILE: join(secretsDirectory, "operations-database-url"),
  YOLPOL_MONITORING_STAGING_BACKUP_DIRECTORY: backupsDirectory,
  YOLPOL_MONITORING_STAGING_BACKUP_ENABLED: "false",
};

const compose = (args, options = {}) => run("docker", [
  "compose",
  "--project-name", project,
  "--file", composeFile,
  "--file", validationComposeFile,
  ...args,
], {...options, env: composeEnvironment});

const pause = (milliseconds) => new Promise((resolvePause) => setTimeout(resolvePause, milliseconds));

async function waitFor(description, operation, timeoutMilliseconds = 120_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = operation();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await pause(2_000);
  }
  throw new Error(`${description} did not become ready.${lastError ? ` ${lastError.message}` : ""}`);
}

function writeSecret(name, value) {
  writeFileSync(join(secretsDirectory, name), `${value}\n`, {encoding: "utf8", mode: 0o600});
}

function helperFetch(url) {
  return docker([
    "run", "--rm",
    "--network", `${project}_monitoring`,
    "--entrypoint", "node",
    operationsImage,
    "-e", `fetch(${JSON.stringify(url)}).then(async response => { const body = await response.text(); if (!response.ok) throw new Error(response.status + ":" + body); process.stdout.write(body); })`,
  ], {capture: true});
}

async function main() {
  writeSecret("telegram-token", "disabled-local-validation");
  writeSecret("telegram-chat-id", "0");
  writeSecret("postgres-uri", "postgres:5432/yolpol_monitoring?sslmode=disable");
  writeSecret("postgres-user", "monitoring_validation");
  writeSecret("postgres-password", "monitoring-validation-password");
  writeSecret("operations-database-url", "postgresql://monitoring_validation:monitoring-validation-password@postgres:5432/yolpol_monitoring?sslmode=disable");

  docker(["build", "--target", "monitoring-runtime", "--tag", operationsImage, "."]);
  docker(["build", "--target", "migration-runtime", "--tag", migrationImage, "."]);
  docker(["network", "create", edgeNetwork]);
  docker(["network", "create", backendNetwork]);

  docker([
    "run", "--detach", "--name", postgresContainer,
    "--network", backendNetwork, "--network-alias", "postgres",
    "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=512m",
    "--env", "POSTGRES_DB=yolpol_monitoring",
    "--env", "POSTGRES_USER=monitoring_validation",
    "--env", "POSTGRES_PASSWORD=monitoring-validation-password",
    "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94",
  ], {capture: true});

  await waitFor("PostgreSQL", () => {
    docker(["exec", postgresContainer, "pg_isready", "-U", "monitoring_validation", "-d", "yolpol_monitoring"], {capture: true});
    return true;
  });

  docker([
    "run", "--rm", "--network", backendNetwork,
    "--env", "DATABASE_URL=postgresql://monitoring_validation:monitoring-validation-password@postgres:5432/yolpol_monitoring?sslmode=disable",
    migrationImage,
  ]);

  docker([
    "run", "--detach", "--name", webContainer,
    "--network", edgeNetwork, "--network-alias", "web",
    "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16m",
    "--entrypoint", "node", operationsImage,
    "-e", "require('node:http').createServer((request,response)=>{response.writeHead(request.url==='/api/health/live'||request.url==='/api/health/ready'?200:404,{'content-type':'application/json'});response.end('{}')}).listen(3000,'0.0.0.0')",
  ], {capture: true});

  compose(["up", "--detach", "--no-build"]);

  const targets = await waitFor("Prometheus targets", () => {
    const response = JSON.parse(helperFetch("http://prometheus:9090/api/v1/targets"));
    const activeTargets = response.data.activeTargets;
    if (activeTargets.length !== 8 || activeTargets.some((target) => target.health !== "up")) return false;
    return activeTargets;
  });

  const operationsMetrics = helperFetch("http://operations-exporter:9464/metrics");
  if (!operationsMetrics.includes('yolpol_queue_eligible_jobs{environment="staging",queue="inquiry_notification"} 0')) {
    throw new Error("Operations exporter did not expose the expected bounded queue metrics.");
  }
  if (!operationsMetrics.includes('yolpol_backup_monitoring_enabled{environment="staging"} 0')) {
    throw new Error("Operations exporter did not expose disabled backup monitoring state.");
  }
  if (/inquiry_id|conversation_id|message_id|customer/iu.test(operationsMetrics)) {
    throw new Error("Operations exporter exposed a forbidden high-cardinality or customer label.");
  }

  const probe = JSON.parse(helperFetch("http://prometheus:9090/api/v1/query?query=probe_success"));
  if (probe.data.result.length !== 2 || probe.data.result.some((series) => series.value[1] !== "1")) {
    throw new Error("Blackbox health probes did not both succeed.");
  }

  const containerIds = compose(["ps", "--quiet"], {capture: true}).trim().split(/\s+/u).filter(Boolean);
  const portBindings = docker([
    "inspect", "--format", "{{json .HostConfig.PortBindings}}", ...containerIds,
  ], {capture: true}).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  for (const bindings of portBindings) {
    for (const published of Object.values(bindings ?? {}).flat()) {
      if (published.HostIp !== "127.0.0.1") throw new Error("A monitoring port is not bound to loopback.");
    }
  }

  compose(["stop", "--timeout", "10", "operations-exporter"]);
  const operationsLogs = compose(["logs", "--no-color", "operations-exporter"], {capture: true});
  if (!operationsLogs.includes('"event":"monitoring.stopped"')) {
    throw new Error("Operations exporter did not log graceful shutdown.");
  }

  process.stdout.write(`${JSON.stringify({
    event: "monitoring.disposable_validation_succeeded",
    targets: targets.map((target) => ({job: target.labels.job, health: target.health})),
    telegramDeliveryAttempted: false,
    namedVolumesDeleted: false,
  })}\n`);
}

try {
  await main();
} catch (error) {
  try { compose(["ps"]); } catch {}
  try { compose(["logs", "--no-color", "--tail", "80"]); } catch {}
  throw error;
} finally {
  try { compose(["down", "--remove-orphans"], {stdio: "ignore"}); } catch {}
  for (const container of [webContainer, postgresContainer]) {
    try { docker(["rm", "--force", container], {stdio: "ignore"}); } catch {}
  }
  for (const network of [edgeNetwork, backendNetwork]) {
    try { docker(["network", "rm", network], {stdio: "ignore"}); } catch {}
  }
  rmSync(fixtureDirectory, {recursive: true, force: true});
}
