import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const compose = readFileSync(resolve(repositoryRoot, "deploy/staging/compose.yaml"), "utf8");
const dockerfile = readFileSync(resolve(repositoryRoot, "Dockerfile"), "utf8");
const caddyfile = readFileSync(resolve(repositoryRoot, "deploy/staging/Caddyfile"), "utf8");

function serviceBlock(service: string): string {
  const lines = compose.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${service}:`);
  if (start < 0) throw new Error(`Missing ${service} service.`);
  const end = lines.findIndex((line, index) => index > start && /^  [a-z][a-z0-9-]*:$/u.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

describe("Staging Compose deployment contract", () => {
  it("keeps the web image as the default Docker target and provides dedicated runtimes", () => {
    const targets = [...dockerfile.matchAll(/^FROM .+ AS ([a-z-]+)$/gmu)].map((match) => match[1]);
    expect(targets).toContain("worker-runtime");
    expect(targets).toContain("migration-runtime");
    expect(targets).toContain("operations-runtime");
    expect(targets).toContain("operations-test");
    expect(targets.at(-1)).toBe("runtime");
    expect(serviceBlock("web")).toContain("target: runtime");
    expect(serviceBlock("inquiry-notifications")).toContain("target: worker-runtime");
    expect(serviceBlock("migrate")).toContain("target: migration-runtime");
  });

  it("accepts explicit release image references while retaining local build defaults", () => {
    expect(serviceBlock("web")).toContain('${YOLPOL_WEB_IMAGE:-yolpol-web:local}');
    expect(serviceBlock("inquiry-notifications")).toContain('${YOLPOL_WORKER_IMAGE:-yolpol-worker:local}');
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
    expect(serviceBlock("backup-deep-verify")).toContain("YOLPOL_BACKUP_AGE_IDENTITY_FILE: /run/secrets/backup_age_identity");
    expect(serviceBlock("restore")).toContain("YOLPOL_BACKUP_AGE_IDENTITY_FILE: /run/secrets/backup_age_identity");
    expect(compose).not.toMatch(/(?:TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|GROQ_API_KEY):/u);
  });
});
