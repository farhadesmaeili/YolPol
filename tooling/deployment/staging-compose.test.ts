import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const compose = readFileSync(resolve(repositoryRoot, "deploy/staging/compose.yaml"), "utf8");
const dockerfile = readFileSync(resolve(repositoryRoot, "Dockerfile"), "utf8");
const caddyfile = readFileSync(resolve(repositoryRoot, "deploy/staging/Caddyfile"), "utf8");
const runtimeEnvironment = readFileSync(resolve(repositoryRoot, "deploy/staging/runtime.env.example"), "utf8");

function serviceBlock(service: string): string {
  const lines = compose.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${service}:`);
  if (start < 0) throw new Error(`Missing ${service} service.`);
  const end = lines.findIndex((line, index) => index > start && /^  [a-z][a-z0-9-]*:$/u.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

function extensionBlock(extension: string): string {
  const lines = compose.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.startsWith(`${extension}:`));
  if (start < 0) throw new Error(`Missing ${extension} extension.`);
  const end = lines.findIndex((line, index) => index > start && /^[a-z][a-z0-9-]*:/u.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

describe("Staging Compose deployment contract", () => {
  it("provides dedicated image runtimes without embedding a build contract", () => {
    const targets = [...dockerfile.matchAll(/^FROM .+ AS ([a-z-]+)$/gmu)].map((match) => match[1]);
    expect(targets).toContain("worker-runtime");
    expect(targets).toContain("migration-runtime");
    expect(targets).toContain("operations-runtime");
    expect(targets).toContain("operations-test");
    expect(targets.at(-1)).toBe("runtime");
    expect(dockerfile).toContain("COPY tooling/staff-provisioning/index.ts tooling/staff-provisioning/bootstrap-super-admin.ts tooling/staff-provisioning/node-terminal.ts ./tooling/staff-provisioning/");
    expect(dockerfile).toContain("COPY tooling/telegram/get-telegram-webhook-info.ts tooling/telegram/set-telegram-webhook.ts tooling/telegram/telegram-webhook-client.ts tooling/telegram/telegram-webhook-commands.ts tooling/telegram/telegram-webhook-config.ts ./tooling/telegram/");
    expect(dockerfile).not.toContain("tooling/telegram/telegram-webhook-tooling.test.ts");
    expect(compose).not.toMatch(/^\s+build:/mu);
  });

  it("accepts explicit release image references with deterministic local image-name defaults", () => {
    expect(serviceBlock("web")).toContain('${YOLPOL_WEB_IMAGE:-yolpol-web:local}');
    expect(serviceBlock("inquiry-notifications")).toContain('${YOLPOL_WORKER_IMAGE:-yolpol-worker:local}');
    expect(extensionBlock("x-staff-operation")).toContain('${YOLPOL_WORKER_IMAGE:-yolpol-worker:local}');
    expect(serviceBlock("migrate")).toContain('${YOLPOL_MIGRATION_IMAGE:-yolpol-migration:local}');
    expect(compose).toContain('${YOLPOL_BACKUP_RESTORE_IMAGE:-yolpol-backup-restore:local}');
    expect(compose).not.toContain(":latest");
  });

  it("defines active services and keeps all migration/backup/restore operations explicit", () => {
    for (const service of [
      "edge",
      "web",
      "postgres",
      "inquiry-notifications",
      "conversation-translation",
      "conversation-ai-fallback",
      "staff-provision",
      "staff-bootstrap-super-admin",
      "telegram-webhook-set",
      "telegram-webhook-info",
      "migrate",
      "backup-create",
      "backup-verify",
      "backup-deep-verify",
      "backup-retention",
      "restore",
    ]) expect(serviceBlock(service)).toBeTruthy();

    expect(compose).toContain("name: yolpol-staging");
    expect(serviceBlock("migrate")).toContain('profiles: ["migration"]');
    expect(serviceBlock("migrate")).toContain('restart: "no"');
    for (const service of ["backup-create", "backup-verify", "backup-deep-verify", "backup-retention"]) {
      expect(serviceBlock(service)).toContain('profiles: ["backup"]');
      expect(serviceBlock(service)).toContain('restart: "no"');
    }
    expect(serviceBlock("restore")).toContain('profiles: ["restore"]');
    expect(serviceBlock("restore")).toContain('restart: "no"');
    const staffOperation = extensionBlock("x-staff-operation");
    for (const service of ["staff-provision", "staff-bootstrap-super-admin"]) {
      expect(serviceBlock(service)).toContain("<<: *staff-operation");
    }
    expect(staffOperation).toContain('profiles: ["staff-operations"]');
    expect(staffOperation).toContain('restart: "no"');
    expect(staffOperation).toContain("stdin_open: true");
    expect(staffOperation).toContain("tty: true");
    expect(staffOperation).toContain("user: \"10001:10001\"");
    expect(staffOperation).toContain("read_only: true");
    expect(staffOperation).toContain("YOLPOL_STAGING_DATABASE_ENV_FILE");
    expect(staffOperation).toContain("networks:\n    - backend");
    expect(staffOperation).not.toContain("provider_egress");
    expect(staffOperation).not.toContain("secrets:");
    expect(staffOperation).not.toContain("ports:");
    expect(serviceBlock("staff-provision")).toContain('command: ["node", "--conditions=react-server", "--import", "tsx", "tooling/staff-provisioning/index.ts"]');
    expect(serviceBlock("staff-bootstrap-super-admin")).toContain('command: ["node", "--conditions=react-server", "--import", "tsx", "tooling/staff-provisioning/bootstrap-super-admin.ts"]');
    const telegramOperation = extensionBlock("x-telegram-operation");
    expect(telegramOperation).toContain('profiles: ["telegram-operations"]');
    expect(telegramOperation).toContain('restart: "no"');
    expect(telegramOperation).toContain('user: "10001:10001"');
    expect(telegramOperation).toContain("read_only: true");
    expect(telegramOperation).toContain("cap_drop:\n    - ALL");
    expect(telegramOperation).toContain("no-new-privileges:true");
    expect(telegramOperation).toContain("networks:\n    - provider_egress");
    expect(telegramOperation).toContain("tmpfs:\n    - /tmp:rw,noexec,nosuid,nodev,size=64m");
    expect(telegramOperation).not.toContain("env_file:");
    expect(telegramOperation).not.toContain("ports:");
    expect(telegramOperation).not.toContain("volumes:");
    expect(telegramOperation).not.toContain("stdin_open:");
    expect(telegramOperation).not.toContain("tty:");
    const webhookSet = serviceBlock("telegram-webhook-set");
    const webhookInfo = serviceBlock("telegram-webhook-info");
    expect(webhookSet).toContain('command: ["node", "--conditions=react-server", "--import", "tsx", "tooling/telegram/set-telegram-webhook.ts"]');
    expect(webhookInfo).toContain('command: ["node", "--conditions=react-server", "--import", "tsx", "tooling/telegram/get-telegram-webhook-info.ts"]');
    expect(webhookSet).toContain("TELEGRAM_WEBHOOK_SECRET_FILE: /run/secrets/telegram_webhook_secret");
    expect(webhookInfo).not.toContain("TELEGRAM_WEBHOOK_SECRET");
    for (const block of [webhookSet, webhookInfo]) {
      expect(block).toContain("TELEGRAM_BOT_TOKEN_FILE: /run/secrets/telegram_bot_token");
      expect(block).toContain('TELEGRAM_WEBHOOK_PUBLIC_ORIGIN: "${YOLPOL_STAGING_TELEGRAM_WEBHOOK_PUBLIC_ORIGIN:?Set YOLPOL_STAGING_TELEGRAM_WEBHOOK_PUBLIC_ORIGIN}"');
      expect(block).not.toContain("DATABASE_URL");
      expect(block).not.toContain("GROQ_API_KEY");
      expect(block).not.toContain("NEXT_PUBLIC_");
    }
    expect(runtimeEnvironment).toContain("YOLPOL_STAGING_TELEGRAM_WEBHOOK_PUBLIC_ORIGIN=https://staging.yolpol.com");
    expect(serviceBlock("backup-verify")).toContain("network_mode: none");
    expect(serviceBlock("backup-deep-verify")).toContain("network_mode: none");
    expect(compose).not.toContain("container_name:");
    expect(compose).not.toContain("channel-delivery");
  });

  it("publishes ports only from Caddy and keeps PostgreSQL on the internal backend", () => {
    expect(serviceBlock("edge")).toContain("ports:");
    expect(serviceBlock("web")).not.toContain("ports:");
    expect(serviceBlock("postgres")).not.toContain("ports:");
    expect(compose).toMatch(/backend:\n    internal: true/u);
    expect(caddyfile).toContain("staging.yolpol.com");
    expect(caddyfile).toContain("reverse_proxy web:3000");
  });

  it("binds file-backed credentials only through run-time secret paths", () => {
    expect(serviceBlock("web")).toContain("TELEGRAM_BOT_TOKEN_FILE: /run/secrets/telegram_bot_token");
    expect(serviceBlock("web")).toContain("TELEGRAM_WEBHOOK_SECRET_FILE: /run/secrets/telegram_webhook_secret");
    expect(serviceBlock("inquiry-notifications")).not.toContain("GROQ_API_KEY_FILE");
    expect(serviceBlock("conversation-translation")).toContain("GROQ_API_KEY_FILE: /run/secrets/groq_api_key");
    expect(serviceBlock("conversation-ai-fallback")).toContain("GROQ_API_KEY_FILE: /run/secrets/groq_api_key");
    expect(serviceBlock("telegram-webhook-set")).not.toMatch(/(?:TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET):/u);
    expect(serviceBlock("telegram-webhook-info")).not.toMatch(/(?:TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET):/u);
    expect(serviceBlock("backup-deep-verify")).toContain("YOLPOL_BACKUP_AGE_IDENTITY_FILE: /run/secrets/backup_age_identity");
    expect(serviceBlock("restore")).toContain("YOLPOL_BACKUP_AGE_IDENTITY_FILE: /run/secrets/backup_age_identity");
    expect(compose).not.toMatch(/(?:TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|GROQ_API_KEY):/u);
  });
});
