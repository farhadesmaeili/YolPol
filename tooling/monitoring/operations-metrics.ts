import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {lstat, readFile, readdir, realpath} from "node:fs/promises";
import {createServer, type Server} from "node:http";
import {dirname, resolve} from "node:path";

import {Pool, type QueryResult} from "pg";

export const operationsMetricsPort = 9464;
export const operationsMetricsPath = "/metrics";
export const requiredMigration = "0022_global_translation_settings";
export const requiredMigrationTimestamp = 1788832991886;
const maximumManifestBytes = 64 * 1024;
const defaultBackupScanIntervalMilliseconds = 300_000;
const queueNames = ["inquiry_notification", "conversation_translation", "ai_fallback"] as const;

type DeploymentEnvironment = "development" | "staging" | "production";
type QueueName = (typeof queueNames)[number];

export type QueueMetric = Readonly<{
  queue: QueueName;
  eligibleJobs: number;
  leasedJobs: number;
  oldestEligibleAgeSeconds: number;
}>;

export type BackupMetric = Readonly<{
  monitoringEnabled: boolean;
  scanSuccess: boolean;
  validPairExists: boolean;
  latestValidTimestampSeconds: number;
  latestValidAgeSeconds: number;
}>;

export type OperationsMetricsConfig = Readonly<{
  environment: DeploymentEnvironment;
  databaseUrl: string;
  port: number;
  backupEnabled: boolean;
  backupDirectory: string;
  backupScanIntervalMilliseconds: number;
}>;

type QueueMetricRow = Readonly<{
  queue: string;
  eligible_jobs: string | number;
  leased_jobs: string | number;
  oldest_eligible_age_seconds: string | number;
}>;

type Queryable = Readonly<{
  query<T extends Record<string, unknown>>(text: string, values: readonly unknown[]): Promise<QueryResult<T>>;
}>;

export const queueMetricsQuery = `with queue_metrics as (
  select 'inquiry_notification'::text as queue,
    count(*) filter (where processed_at is null and available_at <= $1 and (locked_until is null or locked_until <= $1)) as eligible_jobs,
    count(*) filter (where processed_at is null and locked_until > $1) as leased_jobs,
    min(occurred_at) filter (where processed_at is null and available_at <= $1 and (locked_until is null or locked_until <= $1)) as oldest_eligible_at
  from inquiry_outbox
  union all
  select 'conversation_translation'::text,
    count(*) filter (where attempts < 3 and (status = 'PENDING' or (status = 'RUNNING' and leased_until <= $1))),
    count(*) filter (where status = 'RUNNING' and leased_until > $1),
    min(created_at) filter (where attempts < 3 and (status = 'PENDING' or (status = 'RUNNING' and leased_until <= $1)))
  from conversation_translation_jobs
  union all
  select 'ai_fallback'::text,
    count(*) filter (where attempts < 3 and ((status = 'PENDING' and not_before <= $1) or (status = 'RUNNING' and leased_until <= $1))),
    count(*) filter (where status = 'RUNNING' and leased_until > $1),
    min(created_at) filter (where attempts < 3 and ((status = 'PENDING' and not_before <= $1) or (status = 'RUNNING' and leased_until <= $1)))
  from conversation_ai_response_jobs
)
select queue, eligible_jobs, leased_jobs,
  coalesce(greatest(0, extract(epoch from ($1 - oldest_eligible_at))), 0)::double precision as oldest_eligible_age_seconds
from queue_metrics
order by queue`;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonNegativeNumber(value: string | number, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${field} metric value.`);
  return parsed;
}

function isQueueName(value: string): value is QueueName {
  return (queueNames as readonly string[]).includes(value);
}

export async function collectQueueMetrics(database: Queryable, now: Date): Promise<readonly QueueMetric[]> {
  const result = await database.query<QueueMetricRow>(queueMetricsQuery, [now]);
  const metrics = new Map<QueueName, QueueMetric>();
  for (const row of result.rows) {
    if (!isQueueName(row.queue) || metrics.has(row.queue)) throw new Error("Unexpected queue metric result.");
    metrics.set(row.queue, Object.freeze({
      queue: row.queue,
      eligibleJobs: parseNonNegativeNumber(row.eligible_jobs, "eligible job"),
      leasedJobs: parseNonNegativeNumber(row.leased_jobs, "leased job"),
      oldestEligibleAgeSeconds: parseNonNegativeNumber(row.oldest_eligible_age_seconds, "queue age"),
    }));
  }
  if (metrics.size !== queueNames.length) throw new Error("Incomplete queue metric result.");
  return Object.freeze(queueNames.map((queue) => metrics.get(queue)!));
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function metricLine(name: string, labels: Readonly<Record<string, string>>, value: number): string {
  const renderedLabels = Object.entries(labels).map(([key, label]) => `${key}="${escapeLabel(label)}"`).join(",");
  return `${name}{${renderedLabels}} ${value}`;
}

export function renderOperationsMetrics(input: Readonly<{
  environment: DeploymentEnvironment;
  queues: readonly QueueMetric[];
  backup: BackupMetric;
  collectionDurationSeconds: number;
}>): string {
  const environment = {environment: input.environment};
  const lines = [
    "# HELP yolpol_operations_exporter_database_collection_success Whether the current PostgreSQL collection succeeded.",
    "# TYPE yolpol_operations_exporter_database_collection_success gauge",
    metricLine("yolpol_operations_exporter_database_collection_success", environment, 1),
    "# HELP yolpol_operations_exporter_collection_duration_seconds Duration of the current operations metrics collection.",
    "# TYPE yolpol_operations_exporter_collection_duration_seconds gauge",
    metricLine("yolpol_operations_exporter_collection_duration_seconds", environment, input.collectionDurationSeconds),
    "# HELP yolpol_queue_eligible_jobs Number of due or recoverable jobs eligible for a worker claim.",
    "# TYPE yolpol_queue_eligible_jobs gauge",
    ...input.queues.map((metric) => metricLine("yolpol_queue_eligible_jobs", {...environment, queue: metric.queue}, metric.eligibleJobs)),
    "# HELP yolpol_queue_leased_jobs Number of jobs with a currently valid worker lease.",
    "# TYPE yolpol_queue_leased_jobs gauge",
    ...input.queues.map((metric) => metricLine("yolpol_queue_leased_jobs", {...environment, queue: metric.queue}, metric.leasedJobs)),
    "# HELP yolpol_queue_oldest_eligible_age_seconds Age in seconds of the oldest job currently eligible for a worker claim.",
    "# TYPE yolpol_queue_oldest_eligible_age_seconds gauge",
    ...input.queues.map((metric) => metricLine("yolpol_queue_oldest_eligible_age_seconds", {...environment, queue: metric.queue}, metric.oldestEligibleAgeSeconds)),
    "# HELP yolpol_backup_monitoring_enabled Whether backup freshness monitoring is explicitly enabled.",
    "# TYPE yolpol_backup_monitoring_enabled gauge",
    metricLine("yolpol_backup_monitoring_enabled", environment, input.backup.monitoringEnabled ? 1 : 0),
    "# HELP yolpol_backup_integrity_scan_success Whether the latest enabled backup directory scan completed successfully.",
    "# TYPE yolpol_backup_integrity_scan_success gauge",
    metricLine("yolpol_backup_integrity_scan_success", environment, input.backup.scanSuccess ? 1 : 0),
    "# HELP yolpol_backup_valid_pair_exists Whether a manifest and encrypted artifact passed non-decrypting integrity checks.",
    "# TYPE yolpol_backup_valid_pair_exists gauge",
    metricLine("yolpol_backup_valid_pair_exists", environment, input.backup.validPairExists ? 1 : 0),
    "# HELP yolpol_backup_latest_valid_timestamp_seconds Unix timestamp of the latest valid encrypted backup pair, or zero when none exists.",
    "# TYPE yolpol_backup_latest_valid_timestamp_seconds gauge",
    metricLine("yolpol_backup_latest_valid_timestamp_seconds", environment, input.backup.latestValidTimestampSeconds),
    "# HELP yolpol_backup_latest_valid_age_seconds Age in seconds of the latest valid encrypted backup pair, or zero when none exists.",
    "# TYPE yolpol_backup_latest_valid_age_seconds gauge",
    metricLine("yolpol_backup_latest_valid_age_seconds", environment, input.backup.latestValidAgeSeconds),
  ];
  return `${lines.join("\n")}\n`;
}

function disabledBackupMetric(): BackupMetric {
  return Object.freeze({monitoringEnabled: false, scanSuccess: true, validPairExists: false, latestValidTimestampSeconds: 0, latestValidAgeSeconds: 0});
}

function failedBackupMetric(): BackupMetric {
  return Object.freeze({monitoringEnabled: true, scanSuccess: false, validPairExists: false, latestValidTimestampSeconds: 0, latestValidAgeSeconds: 0});
}

function noBackupMetric(): BackupMetric {
  return Object.freeze({monitoringEnabled: true, scanSuccess: true, validPairExists: false, latestValidTimestampSeconds: 0, latestValidAgeSeconds: 0});
}

function backupIdDetails(backupId: string, environment: DeploymentEnvironment): Readonly<{createdAt: Date; revision: string | null}> | null {
  const match = new RegExp(`^yolpol-${environment}-([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z(?:-([0-9a-f]{7,64}))?$`, "u").exec(backupId);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, revision] = match;
  const createdAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  return Number.isFinite(createdAt.getTime()) ? Object.freeze({createdAt, revision: revision ?? null}) : null;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolvePromise);
  });
  return hash.digest("hex");
}

async function verifyBackupPair(directory: string, backupId: string, environment: DeploymentEnvironment): Promise<Date | null> {
  const details = backupIdDetails(backupId, environment);
  if (!details) return null;
  const artifactPath = resolve(directory, `${backupId}.dump.age`);
  const manifestPath = resolve(directory, `${backupId}.manifest.json`);
  const resolvedDirectory = await realpath(directory);
  const [artifactStat, manifestStat] = await Promise.all([lstat(artifactPath), lstat(manifestPath)]);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink() || artifactStat.size < 1 || !manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > maximumManifestBytes) return null;
  const [resolvedArtifact, resolvedManifest] = await Promise.all([realpath(artifactPath), realpath(manifestPath)]);
  if (dirname(resolvedArtifact) !== resolvedDirectory || dirname(resolvedManifest) !== resolvedDirectory) return null;
  const parsed: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!isRecord(parsed) || !isRecord(parsed.postgresql) || !isRecord(parsed.dump) || !isRecord(parsed.encryption) || !isRecord(parsed.artifact) || !isRecord(parsed.schema)) return null;
  const expectedCreatedAt = details.createdAt.toISOString().replace(".000Z", "Z");
  if (parsed.formatVersion !== 1 || parsed.backupId !== backupId || parsed.createdAt !== expectedCreatedAt
    || parsed.deploymentEnvironment !== environment || parsed.applicationRevision !== details.revision
    || parsed.postgresql.majorVersion !== 17 || typeof parsed.postgresql.serverVersion !== "string" || parsed.postgresql.serverVersion.length < 1
    || typeof parsed.postgresql.clientVersion !== "string" || parsed.postgresql.clientVersion.length < 1
    || parsed.dump.format !== "custom" || parsed.encryption.scheme !== "age-x25519"
    || parsed.artifact.filename !== `${backupId}.dump.age` || parsed.artifact.sizeBytes !== artifactStat.size
    || typeof parsed.artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(parsed.artifact.sha256)
    || typeof parsed.schema.latestMigrationTimestamp !== "number" || !Number.isSafeInteger(parsed.schema.latestMigrationTimestamp) || parsed.schema.latestMigrationTimestamp < 0
    || parsed.schema.requiredMigration !== requiredMigration || parsed.schema.requiredMigrationTimestamp !== requiredMigrationTimestamp) return null;
  return await sha256(artifactPath) === parsed.artifact.sha256 ? details.createdAt : null;
}

export async function inspectBackupDirectory(input: Readonly<{
  enabled: boolean;
  directory: string;
  environment: DeploymentEnvironment;
  now: Date;
}>): Promise<BackupMetric> {
  if (!input.enabled) return disabledBackupMetric();
  try {
    const files = await readdir(input.directory);
    const suffix = ".manifest.json";
    const backupIds = files.filter((file) => file.endsWith(suffix)).map((file) => file.slice(0, -suffix.length)).sort().reverse();
    for (const backupId of backupIds) {
      try {
        const createdAt = await verifyBackupPair(input.directory, backupId, input.environment);
        if (!createdAt) continue;
        const timestampSeconds = Math.floor(createdAt.getTime() / 1_000);
        return Object.freeze({
          monitoringEnabled: true,
          scanSuccess: true,
          validPairExists: true,
          latestValidTimestampSeconds: timestampSeconds,
          latestValidAgeSeconds: Math.max(0, Math.floor((input.now.getTime() - createdAt.getTime()) / 1_000)),
        });
      } catch {
        continue;
      }
    }
    return noBackupMetric();
  } catch {
    return failedBackupMetric();
  }
}

function parseEnvironment(value: string | undefined): DeploymentEnvironment {
  if (value === "development" || value === "staging" || value === "production") return value;
  throw new Error("Invalid deployment environment configuration.");
}

function parseBoolean(value: string | undefined): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("Invalid backup monitoring configuration.");
}

function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, field: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Invalid ${field} configuration.`);
  return parsed;
}

async function readSecretFile(path: string | undefined): Promise<string> {
  if (!path) throw new Error("Monitoring database secret file is required.");
  const file = await lstat(path);
  if (!file.isFile() || file.isSymbolicLink() || file.size < 1 || file.size > 16 * 1024) throw new Error("Monitoring database secret file is invalid.");
  const value = (await readFile(path, "utf8")).trim();
  if (!value) throw new Error("Monitoring database secret file is empty.");
  return value;
}

function validateDatabaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Monitoring database URL is invalid."); }
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !url.hostname || !url.username || !url.password || url.pathname.length < 2) {
    throw new Error("Monitoring database URL is incomplete.");
  }
  return value;
}

export async function readOperationsMetricsConfig(environment: NodeJS.ProcessEnv = process.env): Promise<OperationsMetricsConfig> {
  const backupDirectory = resolve(environment.YOLPOL_MONITORING_BACKUP_DIRECTORY ?? "/backups");
  return Object.freeze({
    environment: parseEnvironment(environment.YOLPOL_DEPLOYMENT_ENVIRONMENT),
    databaseUrl: validateDatabaseUrl(await readSecretFile(environment.YOLPOL_MONITORING_DATABASE_URL_FILE)),
    port: parseInteger(environment.YOLPOL_MONITORING_PORT, operationsMetricsPort, 1_024, 65_535, "port"),
    backupEnabled: parseBoolean(environment.YOLPOL_MONITORING_BACKUP_ENABLED),
    backupDirectory,
    backupScanIntervalMilliseconds: parseInteger(environment.YOLPOL_MONITORING_BACKUP_SCAN_INTERVAL_MS, defaultBackupScanIntervalMilliseconds, 30_000, 3_600_000, "backup scan interval"),
  });
}

function logOperationalEvent(environment: DeploymentEnvironment, level: "info" | "error", event: string, fields: Readonly<Record<string, string | number>> = {}): void {
  process.stdout.write(`${JSON.stringify({timestamp: new Date().toISOString(), level, event, service: "operations-metrics", environment, ...fields})}\n`);
}

class BackupMetricCache {
  private cached: Readonly<{collectedAt: number; metric: BackupMetric}> | undefined;
  private pending: Promise<BackupMetric> | undefined;

  constructor(private readonly config: OperationsMetricsConfig) {}

  async read(now: Date): Promise<BackupMetric> {
    if (!this.config.backupEnabled) return disabledBackupMetric();
    if (this.cached && now.getTime() - this.cached.collectedAt < this.config.backupScanIntervalMilliseconds) return this.cached.metric;
    this.pending ??= inspectBackupDirectory({enabled: true, directory: this.config.backupDirectory, environment: this.config.environment, now})
      .then((metric) => {
        this.cached = Object.freeze({collectedAt: now.getTime(), metric});
        if (!metric.scanSuccess) logOperationalEvent(this.config.environment, "error", "monitoring.backup_scan_failed", {stage: "backup_integrity"});
        return metric;
      })
      .finally(() => { this.pending = undefined; });
    return this.pending;
  }
}

function failedCollectionMetrics(environment: DeploymentEnvironment): string {
  return [
    "# HELP yolpol_operations_exporter_database_collection_success Whether the current PostgreSQL collection succeeded.",
    "# TYPE yolpol_operations_exporter_database_collection_success gauge",
    metricLine("yolpol_operations_exporter_database_collection_success", {environment}, 0),
    "",
  ].join("\n");
}

export function createOperationsMetricsServer(config: OperationsMetricsConfig, pool: Pool): Server {
  const backupCache = new BackupMetricCache(config);
  let pendingCollection: Promise<string> | undefined;
  return createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "GET" && request.url === "/-/healthy") {
      response.writeHead(200, {"Content-Type": "text/plain; charset=utf-8"});
      response.end("healthy\n");
      return;
    }
    if (request.method !== "GET" || request.url !== operationsMetricsPath) {
      response.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
      response.end("not found\n");
      return;
    }
    const startedAt = performance.now();
    pendingCollection ??= Promise.all([collectQueueMetrics(pool, new Date()), backupCache.read(new Date())])
      .then(([queues, backup]) => renderOperationsMetrics({
        environment: config.environment,
        queues,
        backup,
        collectionDurationSeconds: Math.max(0, (performance.now() - startedAt) / 1_000),
      }))
      .finally(() => { pendingCollection = undefined; });
    void pendingCollection.then((metrics) => {
      response.writeHead(200, {"Content-Type": "text/plain; version=0.0.4; charset=utf-8"});
      response.end(metrics);
    }).catch(() => {
      logOperationalEvent(config.environment, "error", "monitoring.database_collection_failed", {
        stage: "queue_metrics",
        durationMs: Math.ceil(performance.now() - startedAt),
        errorCode: "DATABASE_COLLECTION_FAILED",
      });
      response.writeHead(503, {"Content-Type": "text/plain; version=0.0.4; charset=utf-8"});
      response.end(failedCollectionMetrics(config.environment));
    });
  });
}

export async function runOperationsMetricsExporter(): Promise<void> {
  const config = await readOperationsMetricsConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    application_name: "yolpol-operations-metrics",
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 5_000,
    query_timeout: 8_000,
  });
  const server = createOperationsMetricsServer(config, pool);
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(config.port, "0.0.0.0", () => resolvePromise());
  });
  logOperationalEvent(config.environment, "info", "monitoring.started", {port: config.port});

  let stopping = false;
  const stop = (signal: "SIGINT" | "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    logOperationalEvent(config.environment, "info", "monitoring.stopping", {signal});
    server.close(() => {
      void pool.end().then(() => {
        logOperationalEvent(config.environment, "info", "monitoring.stopped", {signal});
      }).catch(() => {
        logOperationalEvent(config.environment, "error", "monitoring.shutdown_failed", {signal, errorCode: "DATABASE_POOL_CLOSE_FAILED"});
        process.exitCode = 1;
      });
    });
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
}
