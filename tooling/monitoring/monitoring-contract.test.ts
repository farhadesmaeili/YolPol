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
  const end = lines.findIndex((line, index) => index > start && /^(?:  )?[a-z][a-z0-9-]*:$/u.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

type AlertLabels = Readonly<Record<string, string>>;

type AlertMatcher = Readonly<{
  label: string;
  operator: "=" | "=~";
  value: string;
}>;

type InhibitionRule = Readonly<{
  sourceMatchers: readonly AlertMatcher[];
  targetMatchers: readonly AlertMatcher[];
  equal: readonly string[];
}>;

function parseAlertMatcher(value: string): AlertMatcher {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(=|=~)"([^"]*)"$/u.exec(value);
  if (!match || (match[2] !== "=" && match[2] !== "=~")) {
    throw new Error(`Unsupported Alertmanager matcher: ${value}`);
  }
  return Object.freeze({label: match[1] ?? "", operator: match[2], value: match[3] ?? ""});
}

function parseInhibitionRules(configuration: string): readonly InhibitionRule[] {
  const block = configuration.split(/^inhibit_rules:\s*$/mu)[1]?.split(/^receivers:\s*$/mu)[0];
  if (!block) throw new Error("Missing Alertmanager inhibition rules.");

  const rules: InhibitionRule[] = [];
  let sourceMatchers: AlertMatcher[] = [];
  let targetMatchers: AlertMatcher[] = [];
  let destination: "source" | "target" | undefined;
  for (const line of block.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === "- source_matchers:") {
      sourceMatchers = [];
      targetMatchers = [];
      destination = "source";
    } else if (trimmed === "target_matchers:") {
      destination = "target";
    } else if (trimmed.startsWith("- ") && destination) {
      const matcher = parseAlertMatcher(trimmed.slice(2));
      (destination === "source" ? sourceMatchers : targetMatchers).push(matcher);
    } else {
      const equal = /^equal: \[([^\]]+)\]$/u.exec(trimmed);
      if (equal) {
        rules.push(Object.freeze({
          sourceMatchers: Object.freeze(sourceMatchers),
          targetMatchers: Object.freeze(targetMatchers),
          equal: Object.freeze((equal[1] ?? "").split(",").map((label) => label.trim())),
        }));
        destination = undefined;
      }
    }
  }
  return Object.freeze(rules);
}

function matchAlert(matchers: readonly AlertMatcher[], labels: AlertLabels): boolean {
  return matchers.every((matcher) => matcher.operator === "="
    ? labels[matcher.label] === matcher.value
    : new RegExp(`^(?:${matcher.value})$`, "u").test(labels[matcher.label] ?? ""));
}

function isInhibited(configuration: string, source: AlertLabels, target: AlertLabels): boolean {
  return parseInhibitionRules(configuration).some((rule) =>
    matchAlert(rule.sourceMatchers, source)
    && matchAlert(rule.targetMatchers, target)
    && rule.equal.every((label) => source[label] === target[label]));
}

describe("Monitoring and alerting deployment contract", () => {
  it("defines one isolated eleven-service monitoring project with a dedicated Prometheus administration proxy", () => {
    expect(compose).toContain("name: yolpol-monitoring");
    const services = [
      "prometheus", "prometheus-admin-proxy", "alertmanager", "node-exporter", "cadvisor",
      "postgres-exporter", "blackbox-exporter", "operations-exporter",
      "postgres-exporter-production", "blackbox-exporter-production", "operations-exporter-production",
    ];
    for (const service of services) {
      expect(serviceBlock(service)).toBeTruthy();
      expect(serviceBlock(service)).toContain("mem_limit:");
      expect(serviceBlock(service)).toContain("cpus:");
      expect(serviceBlock(service)).toContain("<<: *service-security");
    }
    for (const singleton of ["prometheus", "prometheus-admin-proxy", "alertmanager", "node-exporter", "cadvisor"]) {
      expect(compose.match(new RegExp(`^  ${singleton}:$`, "gmu"))).toHaveLength(1);
    }
    expect(compose).toContain("logging: *json-logging");
    for (const service of ["prometheus", "prometheus-admin-proxy", "alertmanager", "node-exporter", "cadvisor", "postgres-exporter", "postgres-exporter-production", "blackbox-exporter", "blackbox-exporter-production"]) {
      expect(serviceBlock(service)).toMatch(/image: .+@sha256:[0-9a-f]{64}/u);
    }
    expect(compose).not.toMatch(/image:.*:latest/iu);
    expect(dockerfile).toContain("FROM base AS monitoring-runtime");
    expect(serviceBlock("operations-exporter")).toContain('${YOLPOL_OPERATIONS_METRICS_IMAGE:-yolpol-operations-metrics:local}');
    expect(serviceBlock("operations-exporter-production")).toContain('${YOLPOL_OPERATIONS_METRICS_IMAGE:-yolpol-operations-metrics:local}');
    expect(compose).not.toMatch(/^\s+build:/mu);
  });

  it("publishes Prometheus only through the loopback administration proxy", () => {
    const prometheusService = serviceBlock("prometheus");
    const proxyService = serviceBlock("prometheus-admin-proxy");
    expect(prometheusService).not.toContain("ports:");
    expect(prometheusService).not.toContain("prometheus_admin");
    expect(proxyService).toContain("YOLPOL_MONITORING_BIND_ADDRESS:-127.0.0.1");
    expect(proxyService).toContain("YOLPOL_PROMETHEUS_PORT:-9090");
    expect(proxyService).toMatch(/command:\n      - caddy\n      - reverse-proxy/u);
    expect(proxyService).toContain("http://prometheus:9090");
    expect(proxyService).toContain('user: "65534:65534"');
    expect(proxyService).toContain("<<: *service-security");
    expect(proxyService).toContain("cap_add:\n      - NET_BIND_SERVICE");
    expect(proxyService).toContain("/tmp:rw,noexec,nosuid,nodev,size=16m");
    expect(proxyService).not.toContain("volumes:");
    expect(proxyService).not.toContain("secrets:");
    expect(proxyService).not.toContain("environment:");
    expect(proxyService).not.toContain("docker.sock");
    expect(serviceBlock("alertmanager")).toContain("YOLPOL_MONITORING_BIND_ADDRESS:-127.0.0.1");
    for (const exporter of ["node-exporter", "cadvisor", "postgres-exporter", "postgres-exporter-production", "blackbox-exporter", "blackbox-exporter-production", "operations-exporter", "operations-exporter-production"]) {
      expect(serviceBlock(exporter)).not.toContain("ports:");
    }
  });

  it("keeps scrape traffic internal and grants only required cross-project access", () => {
    expect(compose).toMatch(/monitoring:\n    internal: true/u);
    expect(compose).toMatch(/prometheus_proxy:\n    driver: bridge\n    internal: true\n    attachable: false\n    enable_ipv6: false/u);
    expect(compose).toMatch(/prometheus_admin:\n    driver: bridge\n    internal: false\n    attachable: false\n    enable_ipv6: false/u);
    expect(compose).toContain('com.docker.network.bridge.enable_icc: "false"');
    expect(compose).toContain('com.docker.network.bridge.enable_ip_masquerade: "false"');
    expect(compose).toContain("com.docker.network.bridge.gateway_mode_ipv4: nat");
    expect(compose).toContain("com.docker.network.bridge.host_binding_ipv4: 127.0.0.1");
    expect(compose).toContain("YOLPOL_MONITORING_STAGING_INGRESS_NETWORK:-yolpol-staging-ingress");
    expect(compose).toContain("YOLPOL_MONITORING_STAGING_BACKEND_NETWORK:-yolpol-staging_backend");
    expect(compose).toContain("YOLPOL_MONITORING_PRODUCTION_INGRESS_NETWORK:-yolpol-production-ingress");
    expect(compose).toContain("YOLPOL_MONITORING_PRODUCTION_BACKEND_NETWORK:-yolpol-production_backend");
    expect(serviceBlock("blackbox-exporter")).toContain("- staging_ingress");
    expect(serviceBlock("blackbox-exporter")).not.toContain("production_ingress");
    expect(serviceBlock("blackbox-exporter-production")).toContain("- production_ingress");
    expect(serviceBlock("blackbox-exporter-production")).not.toContain("staging_ingress");
    expect(serviceBlock("postgres-exporter")).toContain("- staging_backend");
    expect(serviceBlock("postgres-exporter")).not.toContain("production_backend");
    expect(serviceBlock("postgres-exporter-production")).toContain("- production_backend");
    expect(serviceBlock("postgres-exporter-production")).not.toContain("staging_backend");
    expect(serviceBlock("operations-exporter")).toContain("- staging_backend");
    expect(serviceBlock("operations-exporter")).not.toContain("production_backend");
    expect(serviceBlock("operations-exporter-production")).toContain("- production_backend");
    expect(serviceBlock("operations-exporter-production")).not.toContain("staging_backend");
    expect(serviceBlock("alertmanager")).toContain("- alert_egress");
    expect(serviceBlock("prometheus")).toMatch(/networks:\n      - monitoring\n      - prometheus_proxy/u);
    expect(serviceBlock("prometheus")).not.toContain("prometheus_admin");
    expect(serviceBlock("prometheus-admin-proxy")).toMatch(/networks:\n      - prometheus_proxy\n      - prometheus_admin/u);
    for (const network of ["monitoring", "alert_egress", "staging_ingress", "staging_backend", "production_ingress", "production_backend"]) {
      expect(serviceBlock("prometheus-admin-proxy")).not.toMatch(new RegExp(`^      - ${network}$`, "mu"));
    }
    for (const service of [
      "alertmanager", "node-exporter", "cadvisor", "postgres-exporter", "postgres-exporter-production",
      "blackbox-exporter", "blackbox-exporter-production", "operations-exporter", "operations-exporter-production",
    ]) {
      expect(serviceBlock(service)).not.toContain("prometheus_proxy");
    }
    for (const service of ["prometheus", "node-exporter", "cadvisor", "postgres-exporter", "postgres-exporter-production", "blackbox-exporter", "blackbox-exporter-production", "operations-exporter", "operations-exporter-production"]) {
      expect(serviceBlock(service)).not.toContain("alert_egress");
    }
    expect(serviceBlock("prometheus")).not.toContain("staging_backend");
  });

  it("confines host and Docker visibility to the standard collectors", () => {
    const nodeExporter = serviceBlock("node-exporter");
    expect(nodeExporter).toContain("source: /proc");
    expect(nodeExporter).toContain("target: /host/proc");
    expect(nodeExporter.match(/create_host_path: false/gu)).toHaveLength(3);
    expect(nodeExporter).not.toContain("docker.sock");

    const cadvisor = serviceBlock("cadvisor");
    expect(cadvisor).toContain("source: /var/run/docker.sock");
    expect(cadvisor).toContain("target: /var/run/docker.sock");
    expect(cadvisor.match(/create_host_path: false/gu)).toHaveLength(4);
    expect(cadvisor).not.toContain("privileged:");
    expect(serviceBlock("blackbox-exporter")).toContain('user: "65534:65534"');
    expect(serviceBlock("blackbox-exporter-production")).toContain('user: "65534:65534"');
    for (const customExporter of ["operations-exporter", "operations-exporter-production"]) {
      expect(serviceBlock(customExporter)).not.toContain("docker.sock");
    }
    expect(dockerfile).toMatch(/FROM base AS monitoring-runtime[\s\S]*?USER 10001:10001/u);
    const socketReferences = compose.match(/docker\.sock/gu);
    expect(socketReferences).toHaveLength(2);
  });

  it("uses bounded retention, scrape timing, and intended internal targets", () => {
    expect(serviceBlock("prometheus")).toContain("--storage.tsdb.retention.time=${YOLPOL_PROMETHEUS_RETENTION_TIME:-15d}");
    expect(serviceBlock("prometheus")).toContain("--storage.tsdb.retention.size=${YOLPOL_PROMETHEUS_RETENTION_SIZE:-2GB}");
    expect(prometheus).toContain("scrape_interval: 30s");
    expect(prometheus).toContain("evaluation_interval: 30s");
    expect(prometheus).toContain("http://staging-web:3000/api/health/live");
    expect(prometheus).toContain("http://staging-web:3000/api/health/ready");
    expect(prometheus).toContain("http://production-web:3000/api/health/live");
    expect(prometheus).toContain("http://production-web:3000/api/health/ready");
    expect(prometheus).toContain('environment: production');
    expect(prometheus).not.toContain("staging.yolpol.com");
    expect(prometheus).not.toContain("https://yolpol.com");
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

  it("models environment-scoped inhibition without hiding unrelated web scrape failures", () => {
    for (const configuration of [alertmanagerLocal, alertmanagerTelegram]) {
      expect(parseInhibitionRules(configuration)).toHaveLength(4);

      const critical = {severity: "critical", environment: "production", service: "web", category: "availability"};
      const warning = {severity: "warning", environment: "production", service: "web", category: "availability"};
      expect(isInhibited(configuration, critical, warning)).toBe(true);
      expect(isInhibited(configuration, critical, {...warning, environment: "staging"})).toBe(false);

      const liveness = {alertname: "YolpolWebLivenessUnavailable", environment: "production", service: "web"};
      const readiness = {alertname: "YolpolWebReadinessUnavailable", environment: "production", service: "web"};
      expect(isInhibited(configuration, liveness, readiness)).toBe(true);
      expect(isInhibited(configuration, liveness, {...readiness, environment: "staging"})).toBe(false);

      for (const environment of ["staging", "production"] as const) {
        const postgresDown = {alertname: "YolpolPostgresExporterDown", environment};
        expect(isInhibited(configuration, postgresDown, {alertname: "YolpolOperationsExporterDown", environment})).toBe(true);
        for (const service of ["postgres", "operations-exporter"] as const) {
          expect(isInhibited(configuration, postgresDown, {
            alertname: "PrometheusTargetScrapeFailing", environment, service,
          })).toBe(true);
        }
        expect(isInhibited(configuration, postgresDown, {
          alertname: "PrometheusTargetScrapeFailing", environment, service: "web",
        })).toBe(false);
        const otherEnvironment = environment === "staging" ? "production" : "staging";
        expect(isInhibited(configuration, postgresDown, {
          alertname: "YolpolOperationsExporterDown", environment: otherEnvironment,
        })).toBe(false);
        expect(isInhibited(configuration, postgresDown, {
          alertname: "PrometheusTargetScrapeFailing", environment: otherEnvironment, service: "postgres",
        })).toBe(false);
      }
    }
  });

  it("covers required alert categories with deterministic rule tests", () => {
    for (const alert of [
      "YolpolWebLivenessUnavailable", "YolpolWebReadinessUnavailable", "YolpolPostgresExporterDown",
      "YolpolPostgresConnectionPressureCritical", "YolpolHostDiskLowCritical", "YolpolHostMemoryLowCritical",
      "YolpolHostCpuHighCritical", "YolpolInquiryNotificationWorkerAbsent", "YolpolConversationTranslationWorkerAbsent",
      "YolpolAiFallbackWorkerAbsent", "YolpolOperationsExporterDown", "YolpolQueueStaleCritical",
      "YolpolBackupMissing", "YolpolBackupStaleCritical", "YolpolSharedIngressContainerAbsent",
      "PrometheusTargetScrapeFailing",
    ]) expect(rules).toContain(`alert: ${alert}`);
    expect(rules).toContain('container_label_com_docker_compose_project="yolpol-ingress"');
    expect(rules).toContain('container_label_com_docker_compose_service="ingress"');
    expect(rules).toContain('container_label_com_docker_compose_project="yolpol-staging"');
    expect(rules).toContain('container_label_com_docker_compose_project="yolpol-production"');
    for (const tested of ["YolpolWebLivenessUnavailable", "YolpolWebReadinessUnavailable", "YolpolPostgresExporterDown", "YolpolOperationsExporterDown", "YolpolHostDiskLowCritical", "YolpolInquiryNotificationWorkerAbsent", "YolpolConversationTranslationWorkerAbsent", "YolpolQueueStaleCritical", "YolpolQueueBacklogLargeCritical", "YolpolBackupMissing", "YolpolBackupStaleCritical"]) {
      expect(ruleTests).toContain(`alertname: ${tested}`);
    }
    expect(ruleTests).toContain('environment="production"');
    expect(ruleTests).toContain("yolpol_backup_monitoring_enabled");
    expect(ruleTests).toContain("values: '0+0x20'");
  });

  it("keeps backup freshness opt-in and secret files separate from application credentials", () => {
    expect(serviceBlock("operations-exporter")).toContain("YOLPOL_MONITORING_STAGING_BACKUP_ENABLED:-false");
    expect(serviceBlock("operations-exporter-production")).toContain("YOLPOL_MONITORING_PRODUCTION_BACKUP_ENABLED:-false");
    expect(serviceBlock("operations-exporter")).toContain("read_only: true");
    expect(serviceBlock("operations-exporter-production")).toContain("read_only: true");
    expect(serviceBlock("operations-exporter")).not.toContain("backup_age_identity");
    expect(compose).toContain("YOLPOL_MONITORING_STAGING_OPERATIONS_DATABASE_URL_FILE");
    expect(compose).toContain("YOLPOL_MONITORING_PRODUCTION_OPERATIONS_DATABASE_URL_FILE");
    expect(serviceBlock("operations-exporter-production")).toContain("/run/secrets/production_operations_database_url");
    expect(serviceBlock("operations-exporter-production")).not.toContain("staging_operations_database_url");
    expect(serviceBlock("postgres-exporter-production")).toContain("production_postgres_exporter_password");
    expect(serviceBlock("postgres-exporter-production")).not.toContain("staging_postgres_exporter_password");
    expect(compose).toContain("YOLPOL_MONITORING_TELEGRAM_BOT_TOKEN_FILE");
    expect(compose).not.toContain("YOLPOL_STAGING_TELEGRAM_BOT_TOKEN_FILE");
  });
});
