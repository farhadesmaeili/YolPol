import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const compose = readFileSync(resolve(repositoryRoot, "deploy/monitoring/compose.yaml"), "utf8");
const prometheus = readFileSync(resolve(repositoryRoot, "deploy/monitoring/prometheus/prometheus.yml"), "utf8");
const rules = readFileSync(resolve(repositoryRoot, "deploy/monitoring/prometheus/rules/yolpol-alerts.yml"), "utf8");
const ruleTests = readFileSync(resolve(repositoryRoot, "deploy/monitoring/prometheus/tests/yolpol-alerts.test.yml"), "utf8");
const alertmanagerLocal = readFileSync(resolve(repositoryRoot, "deploy/monitoring/alertmanager/alertmanager.local.yml"), "utf8");
const alertmanagerTelegram = readFileSync(resolve(repositoryRoot, "deploy/monitoring/alertmanager/alertmanager.telegram.yml"), "utf8");
const dockerfile = readFileSync(resolve(repositoryRoot, "Dockerfile"), "utf8");

function serviceBlock(service: string): string {
  const lines = compose.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${service}:`);
  if (start < 0) throw new Error(`Missing ${service} service.`);
  const end = lines.findIndex((line, index) => index > start && /^  [a-z][a-z0-9-]*:$/u.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

describe("Monitoring and alerting deployment contract", () => {
  it("defines the isolated seven-service monitoring project with immutable upstream images", () => {
    expect(compose).toContain("name: yolpol-monitoring");
    for (const service of ["prometheus", "alertmanager", "node-exporter", "cadvisor", "postgres-exporter", "blackbox-exporter", "operations-exporter"]) {
      expect(serviceBlock(service)).toBeTruthy();
      expect(serviceBlock(service)).toContain("mem_limit:");
      expect(serviceBlock(service)).toContain("cpus:");
      expect(serviceBlock(service)).toContain("<<: *service-security");
    }
    expect(compose).toContain("logging: *json-logging");
    for (const service of ["prometheus", "alertmanager", "node-exporter", "cadvisor", "postgres-exporter", "blackbox-exporter"]) {
      expect(serviceBlock(service)).toMatch(/image: .+@sha256:[0-9a-f]{64}/u);
    }
    expect(compose).not.toMatch(/image:.*:latest/iu);
    expect(dockerfile).toContain("FROM base AS monitoring-runtime");
    expect(serviceBlock("operations-exporter")).toContain("target: monitoring-runtime");
  });

  it("publishes only loopback administration UIs and no exporter port", () => {
    expect(serviceBlock("prometheus")).toContain("YOLPOL_MONITORING_BIND_ADDRESS:-127.0.0.1");
    expect(serviceBlock("alertmanager")).toContain("YOLPOL_MONITORING_BIND_ADDRESS:-127.0.0.1");
    for (const exporter of ["node-exporter", "cadvisor", "postgres-exporter", "blackbox-exporter", "operations-exporter"]) {
      expect(serviceBlock(exporter)).not.toContain("ports:");
    }
  });

  it("keeps scrape traffic internal and grants only required cross-project access", () => {
    expect(compose).toMatch(/monitoring:\n    internal: true/u);
    expect(compose).toContain("YOLPOL_MONITORING_STAGING_EDGE_NETWORK:-yolpol-staging_edge");
    expect(compose).toContain("YOLPOL_MONITORING_STAGING_BACKEND_NETWORK:-yolpol-staging_backend");
    expect(serviceBlock("blackbox-exporter")).toContain("- staging_edge");
    expect(serviceBlock("postgres-exporter")).toContain("- staging_backend");
    expect(serviceBlock("operations-exporter")).toContain("- staging_backend");
    expect(serviceBlock("alertmanager")).toContain("- alert_egress");
    expect(serviceBlock("prometheus")).not.toContain("staging_backend");
  });

  it("confines host and Docker visibility to the standard collectors", () => {
    expect(serviceBlock("node-exporter")).toContain("/proc:/host/proc:ro");
    expect(serviceBlock("node-exporter")).not.toContain("docker.sock");
    expect(serviceBlock("cadvisor")).toContain("/var/run/docker.sock:/var/run/docker.sock:ro");
    expect(serviceBlock("cadvisor")).not.toContain("privileged:");
    expect(serviceBlock("blackbox-exporter")).toContain('user: "65534:65534"');
    expect(serviceBlock("operations-exporter")).not.toContain("docker.sock");
  });

  it("uses bounded retention, scrape timing, and intended internal targets", () => {
    expect(serviceBlock("prometheus")).toContain("--storage.tsdb.retention.time=${YOLPOL_PROMETHEUS_RETENTION_TIME:-15d}");
    expect(serviceBlock("prometheus")).toContain("--storage.tsdb.retention.size=${YOLPOL_PROMETHEUS_RETENTION_SIZE:-2GB}");
    expect(prometheus).toContain("scrape_interval: 30s");
    expect(prometheus).toContain("evaluation_interval: 30s");
    expect(prometheus).toContain("http://web:3000/api/health/live");
    expect(prometheus).toContain("http://web:3000/api/health/ready");
    expect(prometheus).not.toContain("staging.yolpol.com");
  });

  it("keeps local alert delivery inert and Telegram delivery file-backed", () => {
    expect(alertmanagerLocal).toContain("receiver: local-null");
    expect(alertmanagerLocal).not.toContain("telegram_configs");
    expect(alertmanagerTelegram).toContain("telegram_configs:");
    expect(alertmanagerTelegram).toContain("bot_token_file: /run/secrets/alert_telegram_bot_token");
    expect(alertmanagerTelegram).toContain("chat_id_file: /run/secrets/alert_telegram_chat_id");
    expect(alertmanagerTelegram).toContain("send_resolved: true");
    expect(alertmanagerTelegram).not.toMatch(/bot_token:\s*\S|chat_id:\s*-?\d/u);
    expect(compose).not.toMatch(/TELEGRAM_BOT_TOKEN:|TELEGRAM_CHAT_ID:|DATABASE_URL:/u);
  });

  it("keeps dependency and severity inhibition identical for local and Telegram routing", () => {
    for (const configuration of [alertmanagerLocal, alertmanagerTelegram]) {
      expect(configuration.match(/source_matchers:/gu)).toHaveLength(3);
      expect(configuration).toContain('alertname="YolpolWebLivenessUnavailable"');
      expect(configuration).toContain('alertname="YolpolPostgresExporterDown"');
      expect(configuration).toContain('alertname=~"YolpolOperationsExporterDown|PrometheusTargetScrapeFailing"');
      expect(configuration).toContain("equal: [environment, service, category]");
    }
  });

  it("covers required alert categories with deterministic rule tests", () => {
    for (const alert of [
      "YolpolWebLivenessUnavailable", "YolpolWebReadinessUnavailable", "YolpolPostgresExporterDown",
      "YolpolPostgresConnectionPressureCritical", "YolpolHostDiskLowCritical", "YolpolHostMemoryLowCritical",
      "YolpolHostCpuHighCritical", "YolpolInquiryNotificationWorkerAbsent", "YolpolConversationTranslationWorkerAbsent",
      "YolpolAiFallbackWorkerAbsent", "YolpolOperationsExporterDown", "YolpolQueueStaleCritical",
      "YolpolBackupMissing", "YolpolBackupStaleCritical", "PrometheusTargetScrapeFailing",
    ]) expect(rules).toContain(`alert: ${alert}`);
    for (const tested of ["YolpolWebLivenessUnavailable", "YolpolWebReadinessUnavailable", "YolpolHostDiskLowCritical", "YolpolInquiryNotificationWorkerAbsent", "YolpolQueueStaleCritical", "YolpolBackupMissing", "YolpolBackupStaleCritical"]) {
      expect(ruleTests).toContain(`alertname: ${tested}`);
    }
    expect(ruleTests).toContain("yolpol_backup_monitoring_enabled");
    expect(ruleTests).toContain("values: '0+0x20'");
  });

  it("keeps backup freshness opt-in and secret files separate from application credentials", () => {
    expect(serviceBlock("operations-exporter")).toContain("YOLPOL_MONITORING_STAGING_BACKUP_ENABLED:-false");
    expect(serviceBlock("operations-exporter")).toContain("read_only: true");
    expect(serviceBlock("operations-exporter")).not.toContain("backup_age_identity");
    expect(compose).toContain("YOLPOL_MONITORING_STAGING_OPERATIONS_DATABASE_URL_FILE");
    expect(compose).toContain("YOLPOL_MONITORING_TELEGRAM_BOT_TOKEN_FILE");
    expect(compose).not.toContain("YOLPOL_STAGING_TELEGRAM_BOT_TOKEN_FILE");
  });
});
