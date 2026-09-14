import {spawnSync} from "node:child_process";
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const dockerfile = readFileSync(resolve(repositoryRoot, "Dockerfile"), "utf8");
const wrapperPath = resolve(repositoryRoot, "deploy/operations/yolpol-deploy");
const wrapper = readFileSync(wrapperPath, "utf8");
const policyPath = resolve(repositoryRoot, "deploy/operations/yolpol-deploy-policy.py");
const policy = readFileSync(policyPath, "utf8");
const sudoers = readFileSync(resolve(repositoryRoot, "deploy/operations/sudoers.yolpol-deploy"), "utf8");
const operationsReadme = readFileSync(resolve(repositoryRoot, "deploy/operations/README.md"), "utf8");

function wrapperComposeInvocations(subcommand: "run" | "up"): string[] {
  const invocationPattern = new RegExp(`\\bstaging_compose\\b.*\\b${subcommand}\\b`, "u");
  return wrapper.split(/\r?\n/u).map((line) => line.trim()).filter((line) => invocationPattern.test(line));
}

function stageBlock(stage: string): string {
  const lines = dockerfile.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.endsWith(` AS ${stage}`));
  if (start < 0) throw new Error(`Missing Docker stage ${stage}.`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("FROM "));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

function shellPath(path: string): string {
  if (process.platform !== "win32") return path;
  return path.replaceAll("\\", "/");
}

function runShell(...args: readonly string[]) {
  const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\sh.exe" : "/bin/sh";
  return spawnSync(shell, args, {
    encoding: "utf8",
    timeout: 10_000,
  });
}

function runPython(...args: readonly string[]) {
  const executable = process.platform === "win32" ? "python" : "python3";
  return spawnSync(executable, args, {encoding: "utf8", timeout: 20_000});
}

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}

function promoteRepositoryFile(source: string, destination: string): void {
  mkdirSync(dirname(destination), {recursive: true});
  copyFileSync(resolve(repositoryRoot, source), destination);
}

function runResolvedPolicy(mode: "staging" | "monitoring", model: unknown) {
  const executable = process.platform === "win32" ? "python" : "python3";
  return spawnSync(executable, [resolve(repositoryRoot, "tooling/deployment/resolved-compose-policy-check.py"), mode], {
    encoding: "utf8",
    input: JSON.stringify(model),
    timeout: 20_000,
  });
}

const dockerComposeAvailable = spawnSync("docker", ["compose", "version"], {encoding: "utf8", timeout: 10_000}).status === 0;
const dockerIt = dockerComposeAvailable ? it : it.skip;

describe("Production deployment hardening", () => {
  it("runs every first-party runtime as the dedicated non-login UID/GID", () => {
    for (const stage of ["runtime", "worker-runtime", "migration-runtime", "operations-runtime", "monitoring-runtime"]) {
      const block = stageBlock(stage);
      expect(block).toContain("USER 10001:10001");
      expect(block).toMatch(/(?:useradd .*--shell \/usr\/sbin\/nologin|adduser .* -s \/sbin\/nologin)/u);
    }

    expect(dockerfile).not.toMatch(/USER 0(?::0)?/u);
    expect(dockerfile).not.toMatch(/USER 1001:1001|--uid 1001|--gid 1001|adduser .* -u 1001|addgroup -g 1001/u);
    expect(stageBlock("runtime")).toContain("chown yolpol:yolpol .next/cache");
  });

  it("keeps the wrapper shell syntax valid", () => {
    const result = runShell("-n", shellPath(wrapperPath));
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects unknown commands before reaching privileged operations", () => {
    const result = runShell(shellPath(wrapperPath), "docker");
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("unknown command");
  });

  it("rejects unexpected arguments and caller-selected paths", () => {
    const result = runShell(shellPath(wrapperPath), "status", "--file", "/tmp/untrusted.yaml");
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("unexpected arguments");
    expect(wrapper).toContain("STAGING_COMPOSE=/opt/yolpol/staging/compose.yaml");
    expect(wrapper).toContain("STAGING_ENV=/opt/yolpol/staging/runtime.env");
    expect(wrapper).toContain("MONITORING_COMPOSE=/opt/yolpol/monitoring/compose.yaml");
    expect(wrapper).toContain("MONITORING_ENV=/opt/yolpol/monitoring/runtime.env");
    expect(wrapper).toContain("/usr/bin/env -i");
    expect(wrapper).not.toMatch(/eval |\$\{COMPOSE_FILE|\$\{COMPOSE_PROJECT_NAME/u);
  });

  it("behaviorally rejects malicious backup identifiers before privileged work", () => {
    const maliciousIds = [
      "../../root/.ssh/authorized_keys",
      "yolpol-staging-20260913T000000Z-abcdef0\n--help",
      "yolpol-staging-20260913T000000Z-$(id)",
      "yolpol-staging-20260913T000000Z-abcdef0;sh",
      `yolpol-staging-20260913T000000Z-${"a".repeat(65)}`,
    ];
    // MSYS strips a terminal carriage return while translating Windows argv.
    if (process.platform !== "win32") maliciousIds.push("yolpol-staging-20260913T000000Z-abcdef0\r");
    for (const backupId of maliciousIds) {
      const result = runShell(shellPath(wrapperPath), "backup-verify", backupId);
      expect(result.status, `${JSON.stringify(backupId)}: ${result.stderr}`).toBe(64);
      expect(result.stderr).toMatch(/invalid backup ID|requires exactly one backup ID/u);
    }
  }, 20_000);

  it("executes the adversarial policy suite", () => {
    const result = runPython(resolve(repositoryRoot, "tooling/deployment/deployment-policy-adversarial.py"));
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stderr).toContain("OK");
  });

  dockerIt("validates promoted Compose JSON from target-host project directories and rejects model-level privilege attempts", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "yolpol-deployment-policy-"));
    try {
      const stagingProjectDirectory = join(temporaryDirectory, "opt", "yolpol", "staging");
      const monitoringProjectDirectory = join(temporaryDirectory, "opt", "yolpol", "monitoring");
      for (const [source, destination] of [
        ["deploy/staging/compose.yaml", join(stagingProjectDirectory, "compose.yaml")],
        ["deploy/staging/Caddyfile", join(stagingProjectDirectory, "Caddyfile")],
        ["deploy/staging/runtime.env.example", join(stagingProjectDirectory, "runtime.env")],
        ["deploy/monitoring/compose.yaml", join(monitoringProjectDirectory, "compose.yaml")],
        ["deploy/monitoring/runtime.env.example", join(monitoringProjectDirectory, "runtime.env")],
        ["deploy/monitoring/prometheus/prometheus.yml", join(monitoringProjectDirectory, "prometheus", "prometheus.yml")],
        ["deploy/monitoring/alertmanager/alertmanager.local.yml", join(monitoringProjectDirectory, "alertmanager", "alertmanager.local.yml")],
        ["deploy/monitoring/blackbox/blackbox.yml", join(monitoringProjectDirectory, "blackbox", "blackbox.yml")],
      ]) promoteRepositoryFile(source, destination);

      const databaseUrl = "postgresql://yolpol:synthetic-password@postgres:5432/yolpol";
      const stagingSecretsDirectory = join(stagingProjectDirectory, "secrets");
      mkdirSync(stagingSecretsDirectory, {recursive: true});
      const postgresEnvironment = join(stagingSecretsDirectory, "postgres.env");
      const appEnvironment = join(stagingSecretsDirectory, "app-database.env");
      const migrationEnvironment = join(stagingSecretsDirectory, "migration-database.env");
      const backupEnvironment = join(stagingSecretsDirectory, "backup-database.env");
      const restoreEnvironment = join(stagingSecretsDirectory, "restore-database.env");
      writeFileSync(postgresEnvironment, "POSTGRES_DB=yolpol\nPOSTGRES_USER=yolpol\nPOSTGRES_PASSWORD=synthetic-password\n", {encoding: "utf8", mode: 0o600});
      for (const path of [appEnvironment, migrationEnvironment, backupEnvironment, restoreEnvironment]) {
        writeFileSync(path, `DATABASE_URL=${databaseUrl}\n`, {encoding: "utf8", mode: 0o600});
      }
      const staging = spawnSync("docker", [
        "compose", "-p", "yolpol-staging",
        "--project-directory", stagingProjectDirectory,
        "--env-file", join(stagingProjectDirectory, "runtime.env"),
        "-f", join(stagingProjectDirectory, "compose.yaml"),
        "--profile", "migration", "--profile", "backup", "--profile", "staff-operations", "--profile", "telegram-operations", "config", "--format", "json",
      ], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          YOLPOL_STAGING_POSTGRES_ENV_FILE: postgresEnvironment,
          YOLPOL_STAGING_DATABASE_ENV_FILE: appEnvironment,
          YOLPOL_STAGING_MIGRATION_ENV_FILE: migrationEnvironment,
          YOLPOL_STAGING_BACKUP_DATABASE_ENV_FILE: backupEnvironment,
          YOLPOL_STAGING_RESTORE_DATABASE_ENV_FILE: restoreEnvironment,
        },
        maxBuffer: 8_000_000,
        timeout: 20_000,
      });
      expect(staging.status, staging.stderr).toBe(0);
      const stagingModel: unknown = JSON.parse(staging.stdout);
      const stagingPolicy = runResolvedPolicy("staging", stagingModel);
      expect(stagingPolicy.status, stagingPolicy.stderr).toBe(0);

      const unexpectedBuild = structuredClone(requireObject(stagingModel));
      requireObject(requireObject(unexpectedBuild.services).web).build = {
        context: "/opt",
        dockerfile: "Dockerfile",
        target: "runtime",
      };
      const unexpectedBuildPolicy = runResolvedPolicy("staging", unexpectedBuild);
      expect(unexpectedBuildPolicy.status).toBe(1);
      expect(unexpectedBuildPolicy.stderr).toContain("unexpected Compose build");

      const privilegedStaging = structuredClone(requireObject(stagingModel));
      const stagingServices = requireObject(privilegedStaging.services);
      requireObject(stagingServices.web).privileged = true;
      expect(runResolvedPolicy("staging", privilegedStaging).status).toBe(1);

      const arbitraryStagingService = structuredClone(requireObject(stagingModel));
      const arbitraryServices = requireObject(arbitraryStagingService.services);
      arbitraryServices["root-shell"] = structuredClone(requireObject(arbitraryServices.web));
      expect(runResolvedPolicy("staging", arbitraryStagingService).status).toBe(1);

      const socketInjection = structuredClone(requireObject(stagingModel));
      const socketWeb = requireObject(requireObject(socketInjection.services).web);
      const webVolumes = socketWeb.volumes;
      const injectedMount = {type: "bind", source: "/var/run/docker.sock", target: "/var/run/docker.sock", read_only: true};
      if (webVolumes === undefined) socketWeb.volumes = [injectedMount];
      else if (Array.isArray(webVolumes)) webVolumes.push(injectedMount);
      else throw new Error("Expected web volumes to be absent or an array.");
      expect(runResolvedPolicy("staging", socketInjection).status).toBe(1);

      const hostPathCreation = structuredClone(requireObject(stagingModel));
      const edge = requireObject(requireObject(hostPathCreation.services).edge);
      const edgeVolumes = edge.volumes;
      if (!Array.isArray(edgeVolumes)) throw new Error("Expected edge volumes.");
      const caddyfileMount = edgeVolumes.map(requireObject).find((volume) => volume.target === "/etc/caddy/Caddyfile");
      if (caddyfileMount === undefined) throw new Error("Expected Caddyfile mount.");
      requireObject(caddyfileMount.bind).create_host_path = true;
      expect(runResolvedPolicy("staging", hostPathCreation).status).toBe(1);

      const profileInjection = structuredClone(requireObject(stagingModel));
      requireObject(requireObject(profileInjection.services).web).profiles = ["attacker"];
      expect(runResolvedPolicy("staging", profileInjection).status).toBe(1);

      const staffCommandInjection = structuredClone(requireObject(stagingModel));
      requireObject(requireObject(staffCommandInjection.services)["staff-provision"]).command = ["sh"];
      expect(runResolvedPolicy("staging", staffCommandInjection).status).toBe(1);

      const staffImageInjection = structuredClone(requireObject(stagingModel));
      requireObject(requireObject(staffImageInjection.services)["staff-provision"]).image = "ghcr.io/attacker/root-shell@sha256:" + "a".repeat(64);
      expect(runResolvedPolicy("staging", staffImageInjection).status).toBe(1);

      const staffEgressInjection = structuredClone(requireObject(stagingModel));
      requireObject(requireObject(staffEgressInjection.services)["staff-provision"]).networks = {
        backend: null,
        provider_egress: null,
      };
      expect(runResolvedPolicy("staging", staffEgressInjection).status).toBe(1);

      const staffTtyRemoval = structuredClone(requireObject(stagingModel));
      requireObject(requireObject(staffTtyRemoval.services)["staff-provision"]).tty = false;
      expect(runResolvedPolicy("staging", staffTtyRemoval).status).toBe(1);

      const telegramCommandInjection = structuredClone(requireObject(stagingModel));
      requireObject(requireObject(telegramCommandInjection.services)["telegram-webhook-info"]).command = ["sh"];
      expect(runResolvedPolicy("staging", telegramCommandInjection).status).toBe(1);

      const telegramDatabaseInjection = structuredClone(requireObject(stagingModel));
      requireObject(requireObject(telegramDatabaseInjection.services)["telegram-webhook-info"]).environment = {
        TELEGRAM_BOT_TOKEN_FILE: "/run/secrets/telegram_bot_token",
        TELEGRAM_WEBHOOK_PUBLIC_ORIGIN: "https://staging.yolpol.com",
        DATABASE_URL: databaseUrl,
      };
      expect(runResolvedPolicy("staging", telegramDatabaseInjection).status).toBe(1);

      const telegramGroqSecretInjection = structuredClone(requireObject(stagingModel));
      const telegramInfo = requireObject(requireObject(telegramGroqSecretInjection.services)["telegram-webhook-info"]);
      const telegramInfoSecrets = telegramInfo.secrets;
      if (!Array.isArray(telegramInfoSecrets)) throw new Error("Expected Telegram info secrets.");
      telegramInfoSecrets.push({source: "groq_api_key", target: "/run/secrets/groq_api_key"});
      expect(runResolvedPolicy("staging", telegramGroqSecretInjection).status).toBe(1);

      const telegramWebhookSecretInjection = structuredClone(requireObject(stagingModel));
      const telegramInfoWithWebhookSecret = requireObject(requireObject(telegramWebhookSecretInjection.services)["telegram-webhook-info"]);
      const infoSecrets = telegramInfoWithWebhookSecret.secrets;
      if (!Array.isArray(infoSecrets)) throw new Error("Expected Telegram info secrets.");
      infoSecrets.push({source: "telegram_webhook_secret", target: "/run/secrets/telegram_webhook_secret"});
      expect(runResolvedPolicy("staging", telegramWebhookSecretInjection).status).toBe(1);

      const telegramBackendInjection = structuredClone(requireObject(stagingModel));
      requireObject(requireObject(telegramBackendInjection.services)["telegram-webhook-set"]).networks = {
        backend: null,
        provider_egress: null,
      };
      expect(runResolvedPolicy("staging", telegramBackendInjection).status).toBe(1);

      const monitoring = spawnSync("docker", [
        "compose", "-p", "yolpol-monitoring",
        "--project-directory", monitoringProjectDirectory,
        "--env-file", join(monitoringProjectDirectory, "runtime.env"),
        "-f", join(monitoringProjectDirectory, "compose.yaml"),
        "config", "--format", "json",
      ], {cwd: repositoryRoot, encoding: "utf8", maxBuffer: 8_000_000, timeout: 20_000});
      expect(monitoring.status, monitoring.stderr).toBe(0);
      const monitoringModel: unknown = JSON.parse(monitoring.stdout);
      const monitoringPolicy = runResolvedPolicy("monitoring", monitoringModel);
      expect(monitoringPolicy.status, monitoringPolicy.stderr).toBe(0);

      const publicMonitoring = structuredClone(requireObject(monitoringModel));
      const monitoringServices = requireObject(publicMonitoring.services);
      const prometheus = requireObject(monitoringServices.prometheus);
      const ports = prometheus.ports;
      if (!Array.isArray(ports) || ports.length !== 1) throw new Error("Expected one Prometheus port.");
      requireObject(ports[0]).host_ip = "0.0.0.0";
      expect(runResolvedPolicy("monitoring", publicMonitoring).status).toBe(1);

      const writableSocket = structuredClone(requireObject(monitoringModel));
      const cadvisor = requireObject(requireObject(writableSocket.services).cadvisor);
      const volumes = cadvisor.volumes;
      if (!Array.isArray(volumes)) throw new Error("Expected cAdvisor volumes.");
      const socketMount = volumes.map(requireObject).find((volume) => volume.target === "/var/run/docker.sock");
      if (socketMount === undefined) throw new Error("Expected cAdvisor Docker socket mount.");
      socketMount.read_only = false;
      expect(runResolvedPolicy("monitoring", writableSocket).status).toBe(1);
    } finally {
      rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  }, 30_000);

  it("exposes only fixed service operations and no monitoring activation", () => {
    expect(wrapper).toContain("/usr/bin/flock -x 9");
    expect(wrapper).not.toContain("deploy-monitoring");
    expect(wrapper).not.toMatch(/docker (?:exec|run)|compose .*\b(?:restore|backup-retention)\b|systemctl/u);
    expect(wrapper).not.toContain("secret rotation");
    expect(wrapper).toContain("run_sensitive staging_compose");
    expect(policy).toContain("validate_staging_compose_model");
    expect(policy).toContain("validate_monitoring_compose_model");
  });

  it("uses valid fixed Compose run commands for migrations, backups, Staff, and Telegram operations", () => {
    const invocations = wrapperComposeInvocations("run");

    expect(invocations).toEqual([
      "run_sensitive staging_compose --profile migration run --rm --no-deps --interactive=false --no-TTY migrate",
      "run_sensitive staging_compose --profile backup run --rm --no-deps --interactive=false --no-TTY backup-create",
      'run_sensitive staging_compose --profile backup run --rm --no-deps --interactive=false --no-TTY backup-verify verify "$BACKUP_ID"',
      "run_interactive staging_compose --profile staff-operations run --rm --no-deps staff-provision",
      "run_interactive staging_compose --profile staff-operations run --rm --no-deps staff-bootstrap-super-admin",
      "staging_compose --profile telegram-operations run --rm --no-deps --interactive=false --no-TTY telegram-webhook-set",
      "staging_compose --profile telegram-operations run --rm --no-deps --interactive=false --no-TTY telegram-webhook-info",
    ]);
    expect(invocations.every((invocation) => !invocation.includes("--no-build"))).toBe(true);
  });

  it("exposes only fixed argument-free Telegram webhook operations", () => {
    for (const action of ["telegram-webhook-set", "telegram-webhook-info"]) {
      const rejected = runShell(shellPath(wrapperPath), action, "--help");
      expect(rejected.status).toBe(64);
      expect(rejected.stderr).toContain("unexpected arguments");
    }

    const telegramInvocations = wrapperComposeInvocations("run").filter((invocation) => invocation.includes("telegram-webhook-"));
    expect(telegramInvocations).toEqual([
      "staging_compose --profile telegram-operations run --rm --no-deps --interactive=false --no-TTY telegram-webhook-set",
      "staging_compose --profile telegram-operations run --rm --no-deps --interactive=false --no-TTY telegram-webhook-info",
    ]);
    expect(telegramInvocations.join(" ")).not.toMatch(/--no-build|\$@|\beval\b/u);
  });

  it("preserves a real TTY only for the two fixed argument-free Staff operations", () => {
    for (const action of ["staff-provision", "staff-bootstrap-super-admin"]) {
      const accepted = runShell(shellPath(wrapperPath), action, "--help");
      expect(accepted.status).toBe(64);
      expect(accepted.stderr).toContain("unexpected arguments");
    }

    expect(wrapper).toContain('[ -t 0 ] && [ -t 1 ] && [ -t 2 ] || fail \'interactive terminal required\'');
    const staffInvocations = wrapperComposeInvocations("run").filter((invocation) => invocation.includes("staff-"));
    expect(staffInvocations).toEqual([
      "run_interactive staging_compose --profile staff-operations run --rm --no-deps staff-provision",
      "run_interactive staging_compose --profile staff-operations run --rm --no-deps staff-bootstrap-super-admin",
    ]);
    expect(staffInvocations.join(" ")).not.toMatch(/--interactive=false|--no-TTY|--no-build/u);
  });

  it("keeps no-build protection on every fixed Compose up command", () => {
    const invocations = wrapperComposeInvocations("up");

    expect(invocations).toEqual([
      "staging_compose up -d --no-build --no-deps postgres",
      "staging_compose up -d --no-build --no-deps web",
      "staging_compose up -d --no-build --no-deps inquiry-notifications conversation-translation conversation-ai-fallback",
      "staging_compose up -d --no-build --no-deps edge",
    ]);
    expect(invocations.every((invocation) => invocation.includes("--no-build"))).toBe(true);
  });

  it("keeps sudo limited to the exact root-owned wrapper", () => {
    const grants = sudoers.split(/\r?\n/u).filter((line) => line && !line.startsWith("Defaults"));
    expect(grants).toEqual([
      "yolpol-operator ALL=(root) NOPASSWD:NOSETENV: /opt/yolpol/bin/yolpol-deploy",
    ]);
    expect(sudoers).not.toMatch(/NOPASSWD:\s*(?:ALL|\/usr\/bin\/docker|\/usr\/bin\/docker-compose|\/usr\/bin\/systemctl|\/bin\/sh|\/bin\/bash)/u);
    expect(sudoers).not.toMatch(/(?<!NO)SETENV/u);
    expect(sudoers).toContain("use_pty");
    expect(operationsReadme).toContain("mode `0440`");
    expect(operationsReadme).toContain("visudo -cf");
  });
});
