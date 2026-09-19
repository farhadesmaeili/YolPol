import {spawnSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const productionDirectory = resolve(repositoryRoot, "deploy/production");
const composePath = resolve(productionDirectory, "compose.yaml");
const runtimePath = resolve(productionDirectory, "runtime.env.example");
const compose = readFileSync(composePath, "utf8");
const stagingCompose = readFileSync(resolve(repositoryRoot, "deploy/staging/compose.yaml"), "utf8");
const runtime = readFileSync(runtimePath, "utf8");
const wrapperPath = resolve(repositoryRoot, "deploy/operations/yolpol-deploy");
const wrapper = readFileSync(wrapperPath, "utf8");
const policy = readFileSync(resolve(repositoryRoot, "deploy/operations/yolpol-deploy-policy.py"), "utf8");

function serviceBlock(service: string): string {
  const lines = compose.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${service}:`);
  if (start < 0) throw new Error(`Missing ${service} service.`);
  const end = lines.findIndex((line, index) => index > start && /^  [a-z][a-z0-9-]*:$/u.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

function shellPath(path: string): string {
  return process.platform === "win32" ? path.replaceAll("\\", "/") : path;
}

function runShell(...args: readonly string[]) {
  const shell = process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\sh.exe" : "/bin/sh";
  return spawnSync(shell, args, {encoding: "utf8", timeout: 10_000});
}

function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}

function runResolvedPolicy(model: unknown) {
  const executable = process.platform === "win32" ? "python" : "python3";
  return spawnSync(executable, [resolve(repositoryRoot, "tooling/deployment/resolved-compose-policy-check.py"), "production"], {
    encoding: "utf8",
    input: JSON.stringify(model),
    timeout: 20_000,
  });
}

const dockerComposeAvailable = spawnSync("docker", ["compose", "version"], {encoding: "utf8", timeout: 10_000}).status === 0;
const dockerIt = dockerComposeAvailable ? it : it.skip;

describe("Production Compose deployment contract", () => {
  it("fixes the Production identity and canonical public origin", () => {
    expect(compose).toContain("name: yolpol-production");
    expect(compose).toContain("YOLPOL_DEPLOYMENT_ENVIRONMENT: production");
    expect(compose).toContain("YOLPOL_APP_ORIGIN: https://yolpol.com");
    expect(runtime).toContain("YOLPOL_PRODUCTION_TELEGRAM_WEBHOOK_PUBLIC_ORIGIN=https://yolpol.com");
  });

  it("requires manifest-derived immutable first-party images and has no build contract", () => {
    expect(compose).not.toMatch(/^\s+build:/mu);
    expect(compose).not.toContain(":latest");
    expect(compose).not.toContain(":local");
    for (const key of ["YOLPOL_WEB_IMAGE", "YOLPOL_WORKER_IMAGE", "YOLPOL_MIGRATION_IMAGE", "YOLPOL_BACKUP_RESTORE_IMAGE"]) {
      expect(compose).toContain(`\${${key}:?`);
      expect(runtime).toMatch(new RegExp(`^${key}=ghcr\\.io/farhadesmaeili/[a-z0-9-]+@sha256:[0-9a-f]{64}$`, "mu"));
    }
  });

  it("defines only the intended active and profile-gated services", () => {
    for (const service of [
      "web", "postgres", "inquiry-notifications", "conversation-translation", "conversation-ai-fallback",
      "staff-provision", "staff-bootstrap-super-admin", "telegram-webhook-set", "telegram-webhook-info",
      "migrate", "backup-create", "backup-verify", "backup-deep-verify", "backup-retention", "restore",
    ]) expect(serviceBlock(service)).toBeTruthy();
    expect(serviceBlock("migrate")).toContain('profiles: ["migration"]');
    expect(serviceBlock("restore")).toContain('profiles: ["restore"]');
    expect(compose).not.toMatch(/^  edge:$/mu);
    for (const service of ["backup-create", "backup-verify", "backup-deep-verify", "backup-retention"]) {
      expect(serviceBlock(service)).toContain('profiles: ["backup"]');
    }
    expect(compose).not.toContain("container_name:");
  });

  it("keeps Production paths, credentials, state, and resource names isolated from Staging", () => {
    expect(runtime).toContain("/opt/yolpol/production/secrets/postgres.env");
    expect(runtime).toContain("/opt/yolpol/production/backups");
    expect(runtime).not.toContain("/opt/yolpol/staging");
    expect(compose).not.toContain("YOLPOL_STAGING_");
    expect(compose).not.toContain("staging.yolpol.com");
    expect(stagingCompose).toContain("name: yolpol-staging");
    expect(stagingCompose).not.toContain("/opt/yolpol/production");
    expect(wrapper).toContain("LAST_BACKUP_FILE=/opt/yolpol/runtime/last-backup-created-at");
    expect(wrapper).toContain("PRODUCTION_LAST_BACKUP_FILE=/opt/yolpol/runtime/production-last-backup-created-at");
    expect(wrapper).toContain("^yolpol-staging-");
    expect(wrapper).toContain("^yolpol-production-");
  });

  it("keeps all Production ports private behind the fixed ingress network", () => {
    expect(serviceBlock("web")).not.toContain("ports:");
    expect(serviceBlock("postgres")).not.toContain("ports:");
    expect(compose).toContain("name: yolpol-production-ingress\n    external: true");
    expect(serviceBlock("web")).toContain("- production-web");
    expect(compose).toMatch(/backend:\n    internal: true/u);
    expect(serviceBlock("staff-provision")).not.toContain("provider_egress");
    expect(serviceBlock("telegram-webhook-info")).not.toContain("DATABASE_URL");
    expect(serviceBlock("telegram-webhook-info")).not.toContain("GROQ_API_KEY");
  });

  it("pins every first-party service to the dedicated non-root identity and restricted privilege set", () => {
    expect(compose).toContain("x-first-party-runtime: &first-party-runtime");
    expect(compose).toContain('user: "10001:10001"');
    expect(compose).toContain("cap_drop:\n    - ALL");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).not.toMatch(/privileged:|cap_add:|devices:|network_mode:\s*host|\/var\/run\/docker\.sock/u);
  });

  it("adds only explicit fixed Production wrapper actions", () => {
    expect(wrapper).toContain("PRODUCTION_COMPOSE=/opt/yolpol/production/compose.yaml");
    expect(wrapper).toContain("PRODUCTION_ENV=/opt/yolpol/production/runtime.env");
    expect(wrapper).toContain("-p yolpol-production");
    expect(wrapper).not.toMatch(/--environment|PRODUCTION_DIRECTORY=\$/u);
    for (const action of [
      "production-validate", "production-status", "production-health", "production-pull-approved-images",
      "production-deploy-database", "production-migrate", "production-deploy-app", "production-deploy-workers",
      "production-staff-provision", "production-staff-bootstrap-super-admin",
      "production-telegram-webhook-set", "production-telegram-webhook-info", "production-backup-create",
    ]) {
      const result = runShell(shellPath(wrapperPath), action, "unexpected");
      expect(result.status, `${action}: ${result.stderr}`).toBe(64);
      expect(result.stderr).toContain("unexpected arguments");
    }
    const blockedEdge = runShell(shellPath(wrapperPath), "production-deploy-edge");
    expect(blockedEdge.status).toBe(64);
    expect(blockedEdge.stderr).toContain("unknown command");
    for (const invocation of [
      ["deploy-app", "production"],
      ["production-deploy-app", "staging"],
      ["migrate", "--environment", "production"],
      ["production-migrate", "--environment", "staging"],
    ]) {
      const result = runShell(shellPath(wrapperPath), ...invocation);
      expect(result.status).toBe(64);
      expect(result.stderr).toContain("unexpected arguments");
    }
    for (const backupId of [
      "yolpol-staging-20260919T000000Z-abcdef0",
      "../../production",
      "yolpol-production-20260919T000000Z-$(id)",
    ]) {
      const result = runShell(shellPath(wrapperPath), "production-backup-verify", backupId);
      expect(result.status).toBe(64);
    }
  }, 20_000);

  it("uses independent fixed active release authorities", () => {
    expect(wrapper).toContain("/opt/yolpol/releases/staging/active/release-manifest.json");
    expect(wrapper).toContain("/opt/yolpol/releases/production/active/release-manifest.json");
    expect(wrapper).not.toContain("/opt/yolpol/releases/active/release-manifest.json");
    expect(policy).toContain('"releases/staging/active/release-manifest.json"');
    expect(policy).toContain('"releases/production/active/release-manifest.json"');
    expect(policy).not.toContain('"releases/active/release-manifest.json"');
    expect(wrapper).toContain("require_staging_release_filesystem");
    expect(wrapper).toContain("require_production_release_filesystem");
    expect(policy).toContain("load_staging_release_manifest()");
    expect(policy).toContain("load_production_release_manifest()");
  });

  it("keeps Production Compose up image-only, has no local edge, and preserves Staff TTYs", () => {
    for (const command of [
      "production_compose up -d --no-build --no-deps postgres",
      "production_compose up -d --no-build --no-deps web",
      "production_compose up -d --no-build --no-deps inquiry-notifications conversation-translation conversation-ai-fallback",
    ]) expect(wrapper).toContain(command);
    expect(wrapper).not.toMatch(/production_compose up .*\bedge\b/u);
    expect(wrapper).toContain("run_interactive production_compose --profile staff-operations run --rm --no-deps staff-provision");
    expect(wrapper).toContain("run_interactive production_compose --profile staff-operations run --rm --no-deps staff-bootstrap-super-admin");
  });

  dockerIt("resolves and passes the closed Production policy while rejecting adversarial mutations", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "yolpol-production-compose-"));
    try {
      const secrets = join(temporaryDirectory, "secrets");
      const backups = join(temporaryDirectory, "backups");
      mkdirSync(secrets, {recursive: true});
      mkdirSync(backups, {recursive: true});
      const databaseUrl = "postgresql://yolpol_app:synthetic-production-password@postgres:5432/yolpol_production";
      const paths = {
        postgres: join(secrets, "postgres.env"),
        app: join(secrets, "app-database.env"),
        migration: join(secrets, "migration-database.env"),
        backup: join(secrets, "backup-database.env"),
        restore: join(secrets, "restore-database.env"),
        telegramToken: join(secrets, "telegram-bot-token"),
        telegramWebhook: join(secrets, "telegram-webhook-secret"),
        groq: join(secrets, "groq-api-key"),
        ageIdentity: join(secrets, "backup-age-identity"),
      };
      writeFileSync(paths.postgres, "POSTGRES_DB=yolpol_production\nPOSTGRES_USER=yolpol_production\nPOSTGRES_PASSWORD=synthetic-production-password\n");
      writeFileSync(paths.app, `DATABASE_URL=${databaseUrl}\n`);
      writeFileSync(paths.migration, "DATABASE_URL=postgresql://yolpol_migration:synthetic-production-password@postgres:5432/yolpol_production\n");
      writeFileSync(paths.backup, "DATABASE_URL=postgresql://yolpol_backup:synthetic-production-password@postgres:5432/yolpol_production\n");
      writeFileSync(paths.restore, "DATABASE_URL=postgresql://yolpol_restore:synthetic-production-password@recovery-postgres:5432/yolpol_recovery\n");
      for (const path of [paths.telegramToken, paths.telegramWebhook, paths.groq, paths.ageIdentity]) writeFileSync(path, "synthetic-not-a-real-secret\n");

      const composeEnvironment = {
        ...process.env,
        YOLPOL_PRODUCTION_POSTGRES_ENV_FILE: paths.postgres,
        YOLPOL_PRODUCTION_DATABASE_ENV_FILE: paths.app,
        YOLPOL_PRODUCTION_MIGRATION_ENV_FILE: paths.migration,
        YOLPOL_PRODUCTION_BACKUP_DATABASE_ENV_FILE: paths.backup,
        YOLPOL_PRODUCTION_RESTORE_DATABASE_ENV_FILE: paths.restore,
        YOLPOL_PRODUCTION_BACKUP_DIRECTORY: backups,
        YOLPOL_PRODUCTION_TELEGRAM_BOT_TOKEN_FILE: paths.telegramToken,
        YOLPOL_PRODUCTION_TELEGRAM_WEBHOOK_SECRET_FILE: paths.telegramWebhook,
        YOLPOL_PRODUCTION_GROQ_API_KEY_FILE: paths.groq,
        YOLPOL_PRODUCTION_BACKUP_AGE_IDENTITY_FILE: paths.ageIdentity,
        INQUIRY_NOTIFICATION_WORKER_POLL_MS: "2000",
        CONVERSATION_TRANSLATION_WORKER_POLL_MS: "2000",
        CONVERSATION_AI_FALLBACK_WORKER_POLL_MS: "2000",
        YOLPOL_AI_AUTOMATION_EMERGENCY_DISABLED: "false",
      };
      const fullResolution = spawnSync("docker", [
        "compose", "-p", "yolpol-production", "--project-directory", productionDirectory,
        "--env-file", runtimePath, "-f", composePath,
        "--profile", "migration", "--profile", "backup", "--profile", "restore",
        "--profile", "staff-operations", "--profile", "telegram-operations", "config", "--quiet",
      ], {cwd: repositoryRoot, encoding: "utf8", timeout: 20_000, env: composeEnvironment});
      expect(fullResolution.status, fullResolution.stderr).toBe(0);

      const result = spawnSync("docker", [
        "compose", "-p", "yolpol-production", "--project-directory", productionDirectory,
        "--env-file", runtimePath, "-f", composePath,
        "--profile", "migration", "--profile", "backup", "--profile", "staff-operations", "--profile", "telegram-operations",
        "config", "--format", "json",
      ], {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 8_000_000,
        timeout: 20_000,
        env: composeEnvironment,
      });
      expect(result.status, result.stderr).toBe(0);
      const model: unknown = JSON.parse(result.stdout);
      const policyResult = runResolvedPolicy(model);
      expect(policyResult.status, policyResult.stderr).toBe(0);

      const attacks: Array<(model: Record<string, unknown>) => void> = [
        (value) => { value.name = "yolpol-staging"; },
        (value) => { requireObject(requireObject(value.services).web).build = {context: "/opt"}; },
        (value) => { requireObject(requireObject(value.services).web).user = "0:0"; },
        (value) => { requireObject(requireObject(value.services).postgres).ports = [{mode: "ingress", host_ip: "0.0.0.0", target: 5432, published: "5432", protocol: "tcp"}]; },
        (value) => { requireObject(requireObject(value.services).web).ports = [{mode: "ingress", host_ip: "0.0.0.0", target: 3000, published: "443", protocol: "tcp"}]; },
        (value) => { requireObject(requireObject(value.networks).ingress).name = "yolpol-staging-ingress"; },
        (value) => { requireObject(requireObject(value.services).web).networks = {ingress: {aliases: ["staging-web"]}, backend: null}; },
        (value) => { requireObject(requireObject(value.services).web).environment = {...requireObject(requireObject(requireObject(value.services).web).environment), YOLPOL_APP_ORIGIN: "https://attacker.example"}; },
        (value) => { requireObject(requireObject(value.services).web).environment = {...requireObject(requireObject(requireObject(value.services).web).environment), YOLPOL_APP_ORIGIN: "https://staging.yolpol.com"}; },
        (value) => { requireObject(requireObject(value.services)["staff-provision"]).networks = {backend: null, provider_egress: null}; },
        (value) => { requireObject(requireObject(value.volumes).postgres_data).name = "yolpol-staging_postgres_data"; },
      ];
      for (const attack of attacks) {
        const attacked = structuredClone(requireObject(model));
        attack(attacked);
        expect(runResolvedPolicy(attacked).status).toBe(1);
      }
    } finally {
      rmSync(temporaryDirectory, {recursive: true, force: true});
    }
  }, 30_000);
});
