import {execFileSync} from "node:child_process";
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const project = "yolpol-monitoring-validation-0070";
const prefix = `${project}-fixture`;
const stagingIngressNetwork = `${prefix}-staging-ingress`;
const productionIngressNetwork = `${prefix}-production-ingress`;
const stagingBackendNetwork = `${prefix}-staging-backend`;
const productionBackendNetwork = `${prefix}-production-backend`;
const stagingPostgresContainer = `${prefix}-staging-postgres`;
const productionPostgresContainer = `${prefix}-production-postgres`;
const stagingWebContainer = `${prefix}-staging-web`;
const productionWebContainer = `${prefix}-production-web`;
const operationsImage = "yolpol-operations-metrics:validation-0070";
const migrationImage = "yolpol-migrations:validation-0070";
const composeFile = resolve("deploy/monitoring/compose.yaml");
const validationComposeFile = resolve("deploy/monitoring/compose.docker-desktop-validation.yaml");
const fixtureDirectory = mkdtempSync(join(tmpdir(), `${prefix}-`));
const secretsDirectory = join(fixtureDirectory, "secrets");
const stagingBackupsDirectory = join(fixtureDirectory, "staging-backups");
const productionBackupsDirectory = join(fixtureDirectory, "production-backups");

mkdirSync(secretsDirectory);
mkdirSync(stagingBackupsDirectory);
mkdirSync(productionBackupsDirectory);

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: resolve("."),
  encoding: "utf8",
  stdio: options.capture ? "pipe" : "inherit",
  ...options,
});

const docker = (args, options) => run("docker", args, options);
const composeEnvironment = {
  ...process.env,
  YOLPOL_OPERATIONS_METRICS_IMAGE: operationsImage,
  YOLPOL_MONITORING_BIND_ADDRESS: "127.0.0.1",
  YOLPOL_PROMETHEUS_PORT: "19090",
  YOLPOL_ALERTMANAGER_PORT: "19093",
  YOLPOL_MONITORING_STAGING_INGRESS_NETWORK: stagingIngressNetwork,
  YOLPOL_MONITORING_STAGING_BACKEND_NETWORK: stagingBackendNetwork,
  YOLPOL_MONITORING_PRODUCTION_INGRESS_NETWORK: productionIngressNetwork,
  YOLPOL_MONITORING_PRODUCTION_BACKEND_NETWORK: productionBackendNetwork,
  YOLPOL_ALERTMANAGER_CONFIG_FILE: resolve("deploy/monitoring/alertmanager/alertmanager.local.yml"),
  YOLPOL_MONITORING_TELEGRAM_BOT_TOKEN_FILE: join(secretsDirectory, "telegram-token"),
  YOLPOL_MONITORING_TELEGRAM_CHAT_ID_FILE: join(secretsDirectory, "telegram-chat-id"),
  YOLPOL_MONITORING_STAGING_POSTGRES_URI_FILE: join(secretsDirectory, "staging-postgres-uri"),
  YOLPOL_MONITORING_STAGING_POSTGRES_USER_FILE: join(secretsDirectory, "staging-postgres-user"),
  YOLPOL_MONITORING_STAGING_POSTGRES_PASSWORD_FILE: join(secretsDirectory, "staging-postgres-password"),
  YOLPOL_MONITORING_STAGING_OPERATIONS_DATABASE_URL_FILE: join(secretsDirectory, "staging-operations-database-url"),
  YOLPOL_MONITORING_STAGING_BACKUP_DIRECTORY: stagingBackupsDirectory,
  YOLPOL_MONITORING_STAGING_BACKUP_ENABLED: "false",
  YOLPOL_MONITORING_PRODUCTION_POSTGRES_URI_FILE: join(secretsDirectory, "production-postgres-uri"),
  YOLPOL_MONITORING_PRODUCTION_POSTGRES_USER_FILE: join(secretsDirectory, "production-postgres-user"),
  YOLPOL_MONITORING_PRODUCTION_POSTGRES_PASSWORD_FILE: join(secretsDirectory, "production-postgres-password"),
  YOLPOL_MONITORING_PRODUCTION_OPERATIONS_DATABASE_URL_FILE: join(secretsDirectory, "production-operations-database-url"),
  YOLPOL_MONITORING_PRODUCTION_BACKUP_DIRECTORY: productionBackupsDirectory,
  YOLPOL_MONITORING_PRODUCTION_BACKUP_ENABLED: "false",
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

function startPostgres(container, network, database, user, password) {
  docker([
    "run", "--detach", "--name", container,
    "--network", network, "--network-alias", "postgres",
    "--tmpfs", "/var/lib/postgresql/data:rw,noexec,nosuid,size=512m",
    "--env", `POSTGRES_DB=${database}`,
    "--env", `POSTGRES_USER=${user}`,
    "--env", `POSTGRES_PASSWORD=${password}`,
    "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94",
  ], {capture: true});
}

function migrateDatabase(network, databaseUrl) {
  docker(["run", "--rm", "--network", network, "--env", `DATABASE_URL=${databaseUrl}`, migrationImage]);
}

function startWeb(container, network, alias) {
  docker([
    "run", "--detach", "--name", container,
    "--network", network, "--network-alias", alias,
    "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16m",
    "--entrypoint", "node", operationsImage,
    "-e", "require('node:http').createServer((request,response)=>{response.writeHead(request.url==='/api/health/live'||request.url==='/api/health/ready'?200:404,{'content-type':'application/json'});response.end('{}')}).listen(3000,'0.0.0.0')",
  ], {capture: true});
}

function serviceNetworks(service) {
  const containerId = compose(["ps", "--quiet", service], {capture: true}).trim();
  return Object.keys(JSON.parse(docker(["inspect", "--format", "{{json .NetworkSettings.Networks}}", containerId], {capture: true})));
}

async function main() {
  writeSecret("telegram-token", "disabled-local-validation");
  writeSecret("telegram-chat-id", "0");
  writeSecret("staging-postgres-uri", "postgres:5432/yolpol_monitoring_staging?sslmode=disable");
  writeSecret("staging-postgres-user", "monitoring_staging");
  writeSecret("staging-postgres-password", "monitoring-staging-password");
  writeSecret("staging-operations-database-url", "postgresql://monitoring_staging:monitoring-staging-password@postgres:5432/yolpol_monitoring_staging?sslmode=disable");
  writeSecret("production-postgres-uri", "postgres:5432/yolpol_monitoring_production?sslmode=disable");
  writeSecret("production-postgres-user", "monitoring_production");
  writeSecret("production-postgres-password", "monitoring-production-password");
  writeSecret("production-operations-database-url", "postgresql://monitoring_production:monitoring-production-password@postgres:5432/yolpol_monitoring_production?sslmode=disable");

  docker(["build", "--target", "monitoring-runtime", "--tag", operationsImage, "."]);
  docker(["build", "--target", "migration-runtime", "--tag", migrationImage, "."]);
  for (const network of [stagingIngressNetwork, productionIngressNetwork, stagingBackendNetwork, productionBackendNetwork]) docker(["network", "create", network]);

  startPostgres(stagingPostgresContainer, stagingBackendNetwork, "yolpol_monitoring_staging", "monitoring_staging", "monitoring-staging-password");
  startPostgres(productionPostgresContainer, productionBackendNetwork, "yolpol_monitoring_production", "monitoring_production", "monitoring-production-password");

  await waitFor("Staging PostgreSQL", () => {
    docker(["exec", stagingPostgresContainer, "pg_isready", "-U", "monitoring_staging", "-d", "yolpol_monitoring_staging"], {capture: true});
    return true;
  });
  await waitFor("Production PostgreSQL", () => {
    docker(["exec", productionPostgresContainer, "pg_isready", "-U", "monitoring_production", "-d", "yolpol_monitoring_production"], {capture: true});
    return true;
  });

  migrateDatabase(stagingBackendNetwork, "postgresql://monitoring_staging:monitoring-staging-password@postgres:5432/yolpol_monitoring_staging?sslmode=disable");
  migrateDatabase(productionBackendNetwork, "postgresql://monitoring_production:monitoring-production-password@postgres:5432/yolpol_monitoring_production?sslmode=disable");

  startWeb(stagingWebContainer, stagingIngressNetwork, "staging-web");
  startWeb(productionWebContainer, productionIngressNetwork, "production-web");

  compose(["up", "--detach", "--no-build"]);

  const targets = await waitFor("Prometheus targets", () => {
    const response = JSON.parse(helperFetch("http://prometheus:9090/api/v1/targets"));
    const activeTargets = response.data.activeTargets;
    if (activeTargets.length !== 12 || activeTargets.some((target) => target.health !== "up")) return false;
    return activeTargets;
  });

  const operationsMetrics = helperFetch("http://operations-exporter:9464/metrics");
  const productionOperationsMetrics = helperFetch("http://operations-exporter-production:9464/metrics");
  if (!operationsMetrics.includes('yolpol_queue_eligible_jobs{environment="staging",queue="inquiry_notification"} 0')) {
    throw new Error("Operations exporter did not expose the expected bounded queue metrics.");
  }
  if (!operationsMetrics.includes('yolpol_backup_monitoring_enabled{environment="staging"} 0')) {
    throw new Error("Operations exporter did not expose disabled backup monitoring state.");
  }
  if (/inquiry_id|conversation_id|message_id|customer/iu.test(operationsMetrics)) {
    throw new Error("Operations exporter exposed a forbidden high-cardinality or customer label.");
  }
  if (!productionOperationsMetrics.includes('yolpol_queue_eligible_jobs{environment="production",queue="inquiry_notification"} 0')) {
    throw new Error("Production Operations exporter did not expose the expected bounded queue metrics.");
  }
  if (!productionOperationsMetrics.includes('yolpol_backup_monitoring_enabled{environment="production"} 0')) {
    throw new Error("Production Operations exporter did not expose disabled backup monitoring state.");
  }
  if (/inquiry_id|conversation_id|message_id|customer/iu.test(productionOperationsMetrics)) {
    throw new Error("Production Operations exporter exposed a forbidden high-cardinality or customer label.");
  }

  const probe = JSON.parse(helperFetch("http://prometheus:9090/api/v1/query?query=probe_success"));
  if (probe.data.result.length !== 4 || probe.data.result.some((series) => series.value[1] !== "1")) {
    throw new Error("Staging and Production Blackbox health probes did not all succeed.");
  }

  const monitoringNetwork = `${project}_monitoring`;
  const expectedNetworks = new Map([
    ["postgres-exporter", [monitoringNetwork, stagingBackendNetwork]],
    ["operations-exporter", [monitoringNetwork, stagingBackendNetwork]],
    ["blackbox-exporter", [monitoringNetwork, stagingIngressNetwork]],
    ["postgres-exporter-production", [monitoringNetwork, productionBackendNetwork]],
    ["operations-exporter-production", [monitoringNetwork, productionBackendNetwork]],
    ["blackbox-exporter-production", [monitoringNetwork, productionIngressNetwork]],
  ]);
  for (const [service, expected] of expectedNetworks) {
    const actual = serviceNetworks(service).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected.sort())) throw new Error(`${service} crossed an environment network boundary.`);
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
  compose(["stop", "--timeout", "10", "operations-exporter-production"]);
  const productionOperationsLogs = compose(["logs", "--no-color", "operations-exporter-production"], {capture: true});
  if (!productionOperationsLogs.includes('"event":"monitoring.stopped"')) {
    throw new Error("Production Operations exporter did not log graceful shutdown.");
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
  for (const container of [stagingWebContainer, productionWebContainer, stagingPostgresContainer, productionPostgresContainer]) {
    try { docker(["rm", "--force", container], {stdio: "ignore"}); } catch {}
  }
  for (const network of [stagingIngressNetwork, productionIngressNetwork, stagingBackendNetwork, productionBackendNetwork]) {
    try { docker(["network", "rm", network], {stdio: "ignore"}); } catch {}
  }
  rmSync(fixtureDirectory, {recursive: true, force: true});
}
