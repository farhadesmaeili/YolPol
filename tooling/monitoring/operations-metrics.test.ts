import {createHash} from "node:crypto";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {QueryResult} from "pg";
import {afterEach, describe, expect, it} from "vitest";

import {
  collectQueueMetrics,
  inspectBackupDirectory,
  queueMetricsQuery,
  readOperationsMetricsConfig,
  renderOperationsMetrics,
  requiredMigration,
  requiredMigrationTimestamp,
  type QueueMetric,
} from "./operations-metrics";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "yolpol-monitoring-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

const queues: readonly QueueMetric[] = Object.freeze([
  Object.freeze({queue: "inquiry_notification", eligibleJobs: 2, leasedJobs: 1, oldestEligibleAgeSeconds: 901}),
  Object.freeze({queue: "conversation_translation", eligibleJobs: 3, leasedJobs: 0, oldestEligibleAgeSeconds: 902}),
  Object.freeze({queue: "ai_fallback", eligibleJobs: 4, leasedJobs: 1, oldestEligibleAgeSeconds: 903}),
]);

describe("YOLPOL operations metrics", () => {
  it("uses the authoritative indexed worker eligibility and lease predicates", async () => {
    let capturedQuery = "";
    let capturedValues: readonly unknown[] = [];
    const database = {
      async query<T extends Record<string, unknown>>(text: string, values: readonly unknown[]): Promise<QueryResult<T>> {
        capturedQuery = text;
        capturedValues = values;
        return {rows: [
          {queue: "ai_fallback", eligible_jobs: "4", leased_jobs: "1", oldest_eligible_age_seconds: 903},
          {queue: "conversation_translation", eligible_jobs: "3", leased_jobs: "0", oldest_eligible_age_seconds: 902},
          {queue: "inquiry_notification", eligible_jobs: "2", leased_jobs: "1", oldest_eligible_age_seconds: 901},
        ] as unknown as T[]} as QueryResult<T>;
      },
    };
    const now = new Date("2026-09-12T12:00:00.000Z");

    await expect(collectQueueMetrics(database, now)).resolves.toEqual(queues);
    expect(capturedValues).toEqual([now]);
    expect(capturedQuery).toBe(queueMetricsQuery);
    expect(queueMetricsQuery).toContain("processed_at is null and available_at <= $1");
    expect(queueMetricsQuery).toContain("locked_until is null or locked_until <= $1");
    expect(queueMetricsQuery).toContain("attempts < 3 and (status = 'PENDING' or (status = 'RUNNING' and leased_until <= $1))");
    expect(queueMetricsQuery).toContain("status = 'PENDING' and not_before <= $1");
    expect(queueMetricsQuery).not.toMatch(/join\s+(?:inquiries|conversations|conversation_messages)/iu);
  });

  it("renders HELP and TYPE metadata with only fixed environment and queue labels", () => {
    const rendered = renderOperationsMetrics({
      environment: "staging",
      queues,
      backup: {monitoringEnabled: false, scanSuccess: true, validPairExists: false, latestValidTimestampSeconds: 0, latestValidAgeSeconds: 0},
      collectionDurationSeconds: 0.125,
    });

    for (const metric of [
      "yolpol_operations_exporter_database_collection_success",
      "yolpol_queue_eligible_jobs",
      "yolpol_queue_leased_jobs",
      "yolpol_queue_oldest_eligible_age_seconds",
      "yolpol_backup_monitoring_enabled",
      "yolpol_backup_integrity_scan_success",
      "yolpol_backup_valid_pair_exists",
      "yolpol_backup_latest_valid_timestamp_seconds",
      "yolpol_backup_latest_valid_age_seconds",
    ]) {
      expect(rendered).toContain(`# HELP ${metric}`);
      expect(rendered).toContain(`# TYPE ${metric} gauge`);
    }
    expect(rendered).toContain('queue="inquiry_notification"');
    expect(rendered).toContain('queue="conversation_translation"');
    expect(rendered).toContain('queue="ai_fallback"');
    expect(rendered).not.toMatch(/inquiry[_-]?id|conversation[_-]?id|customer[_-]?id|message[_-]?id|email|phone|price|prompt/iu);
  });

  it("verifies an encrypted artifact and manifest without an age identity", async () => {
    const directory = await temporaryDirectory();
    const backupId = "yolpol-staging-20260912T010203Z-abcdef0";
    const artifact = Buffer.from("synthetic encrypted bytes only");
    await writeFile(join(directory, `${backupId}.dump.age`), artifact);
    await writeFile(join(directory, `${backupId}.manifest.json`), JSON.stringify({
      formatVersion: 1,
      backupId,
      createdAt: "2026-09-12T01:02:03Z",
      deploymentEnvironment: "staging",
      applicationRevision: "abcdef0",
      postgresql: {majorVersion: 17, serverVersion: "17.6", clientVersion: "pg_dump (PostgreSQL) 17.6"},
      dump: {format: "custom"},
      encryption: {scheme: "age-x25519"},
      artifact: {filename: `${backupId}.dump.age`, sizeBytes: artifact.byteLength, sha256: createHash("sha256").update(artifact).digest("hex")},
      schema: {latestMigrationTimestamp: requiredMigrationTimestamp, requiredMigration, requiredMigrationTimestamp},
    }));

    await expect(inspectBackupDirectory({enabled: true, directory, environment: "staging", now: new Date("2026-09-12T02:02:03Z")})).resolves.toEqual({
      monitoringEnabled: true,
      scanSuccess: true,
      validPairExists: true,
      latestValidTimestampSeconds: 1789174923,
      latestValidAgeSeconds: 3600,
    });

    await writeFile(join(directory, `${backupId}.dump.age`), "corrupted");
    await expect(inspectBackupDirectory({enabled: true, directory, environment: "staging", now: new Date("2026-09-12T02:02:03Z")})).resolves.toMatchObject({scanSuccess: true, validPairExists: false});
  });

  it("distinguishes disabled, enabled-with-no-backup, and unreadable backup states", async () => {
    const root = await temporaryDirectory();
    const empty = join(root, "empty");
    await mkdir(empty);
    const missing = join(root, "missing");

    await expect(inspectBackupDirectory({enabled: false, directory: missing, environment: "staging", now: new Date()})).resolves.toEqual({
      monitoringEnabled: false, scanSuccess: true, validPairExists: false, latestValidTimestampSeconds: 0, latestValidAgeSeconds: 0,
    });
    await expect(inspectBackupDirectory({enabled: true, directory: empty, environment: "staging", now: new Date()})).resolves.toEqual({
      monitoringEnabled: true, scanSuccess: true, validPairExists: false, latestValidTimestampSeconds: 0, latestValidAgeSeconds: 0,
    });
    await expect(inspectBackupDirectory({enabled: true, directory: missing, environment: "staging", now: new Date()})).resolves.toEqual({
      monitoringEnabled: true, scanSuccess: false, validPairExists: false, latestValidTimestampSeconds: 0, latestValidAgeSeconds: 0,
    });
  });

  it("loads a bounded file-backed monitoring database URL without exposing it", async () => {
    const directory = await temporaryDirectory();
    const secretPath = join(directory, "database-url");
    await writeFile(secretPath, "postgresql://monitor:synthetic@postgres:5432/yolpol\n");

    const config = await readOperationsMetricsConfig({...process.env,
      YOLPOL_DEPLOYMENT_ENVIRONMENT: "staging",
      YOLPOL_MONITORING_DATABASE_URL_FILE: secretPath,
      YOLPOL_MONITORING_BACKUP_ENABLED: "false",
      YOLPOL_MONITORING_PORT: "9464",
    });
    expect(config).toMatchObject({environment: "staging", port: 9464, backupEnabled: false, backupScanIntervalMilliseconds: 300_000});
    expect(config.databaseUrl).toBe("postgresql://monitor:synthetic@postgres:5432/yolpol");
    await expect(readOperationsMetricsConfig({...process.env, YOLPOL_DEPLOYMENT_ENVIRONMENT: "staging", YOLPOL_MONITORING_DATABASE_URL_FILE: secretPath, YOLPOL_MONITORING_BACKUP_ENABLED: "yes"})).rejects.toThrow("Invalid backup monitoring configuration.");
  });
});
