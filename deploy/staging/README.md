# YOLPOL Staging Compose

This directory is the repository-managed deployment definition for the future `https://staging.yolpol.com` environment. It does not deploy a host, modify DNS, contact Cloudflare, or request a certificate by itself.

Use Compose project `yolpol-staging`; the top-level `name` already enforces it. Do not add `container_name` or reuse these volumes, networks, database credentials, or Caddy state for Production.

## Host files

The intended server layout is:

```text
/opt/yolpol/
  staging/
    compose.yaml              repository-managed copy
    Caddyfile                 repository-managed copy
    runtime.env               generated non-secret deployment settings
    secrets/                  generated secret material
      postgres.env
      app-database.env
      migration-database.env
      telegram-bot-token
      telegram-webhook-secret
      groq-api-key
    backups/                  reserved for the later backup feature
```

Create `runtime.env` from `runtime.env.example`, replace its revision/tag and paths, and keep it outside Git. The `secrets` directory should be accessible only to the deployment operator (for example mode `700`). Secret files and database env files should be mode `600`, or equivalently restricted. Compose file-backed secrets are read-only bind mounts and do not portably honor target `uid`, `gid`, or `mode`; on Linux, the deployment service identity must own the credential files as host UID/GID 1001, or a restrictive ACL/group mapping must grant container UID 1001 read access. Verify this exact non-root read path on the target host before activation.

`postgres.env` contains only the PostgreSQL image initialization variables `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. `app-database.env` and `migration-database.env` each contain only a complete `DATABASE_URL`. Do not place any of those values in `runtime.env`, Compose YAML, shell history, or Git.

This foundation does not create a role bootstrap mechanism. Initially the migration and application URLs may refer to the same dedicated Staging owner role. That is not least privilege. A future role split must deliberately provision ownership, migration, and runtime grants before different credentials are configured; merely changing the URLs is unsafe.

## Images and services

The root Dockerfile has three runtime targets:

- `runtime`: unchanged Next.js standalone web artifact, Node 22 Bookworm slim, UID/GID 1001, `node server.js`.
- `worker-runtime`: production dependencies plus `tsx`, worker entrypoints, `tsconfig.json`, and their application source; direct Node commands run as UID/GID 1001.
- `migration-runtime`: production Drizzle/pg dependencies, committed SQL/journal, and the migration runner; runs as UID/GID 1001.

Compose runs `edge`, `web`, `postgres`, `inquiry-notifications`, `conversation-translation`, and `conversation-ai-fallback`. `migrate` is a profile-gated one-shot tool and never starts during a normal `up`.

## Release order

Run commands from this directory, using the host-only settings file:

```sh
docker compose --env-file /opt/yolpol/staging/runtime.env build web inquiry-notifications migrate
docker compose --env-file /opt/yolpol/staging/runtime.env up -d postgres
docker compose --env-file /opt/yolpol/staging/runtime.env --profile migration run --rm migrate
docker compose --env-file /opt/yolpol/staging/runtime.env up -d web inquiry-notifications conversation-translation conversation-ai-fallback
docker compose --env-file /opt/yolpol/staging/runtime.env up -d edge
```

The migration runner uses the committed Drizzle migrations and holds a PostgreSQL advisory lock for the entire operation. A second migration waits rather than racing. Migration failure exits non-zero; no application service mutates the schema. Readiness remains responsible for rejecting a database older than `0022_global_translation_settings`.

Start Caddy only after the host, firewall, DNS, and Staging acceptance prerequisites are ready. The committed Caddyfile activates automatic HTTPS when Caddy is actually started for `staging.yolpol.com`; configuration validation alone does not request a certificate.

## Network, ports, and persistence

- `edge`: non-internal Caddy-to-web network; web can also make the outbound Telegram response needed by onboarding.
- `backend`: internal-only PostgreSQL network used by web, workers, and migration. PostgreSQL has no published port.
- `provider_egress`: non-internal worker egress for Telegram/Groq. It does not contain PostgreSQL or Caddy.
- Only Caddy publishes host ports 80 and 443 (TCP, plus UDP 443 for HTTP/3). Web 3000 and PostgreSQL 5432 remain private.
- `postgres_data`, `caddy_data`, and `caddy_config` are Compose-project-scoped persistent volumes. They are not shared with Development or Production.

The PostgreSQL volume/database is the asset a later backup/restore feature must protect. This feature provides no backup, restore test, monitoring, alerting, registry promotion, release automation, or rollback protection.

## Configuration and credentials

All application services use `NODE_ENV=production`, `YOLPOL_DEPLOYMENT_ENVIRONMENT=staging`, `YOLPOL_APP_ORIGIN=https://staging.yolpol.com`, `YOLPOL_LOG_LEVEL=info`, and a validated `YOLPOL_GIT_REVISION`.

- Web: database URL, Staging Telegram bot token, Staging webhook secret, and public-safe Staging bot username.
- Inquiry worker: database URL and Staging Telegram bot token.
- Translation and AI workers: database URL and Staging Groq key. Credential resolution remains lazy, so an empty/disabled queue does not call the provider.
- Migration: migration database URL only.
- PostgreSQL: dedicated Staging database initialization values only.

Staging must use a distinct Telegram bot because Telegram permits one webhook URL per bot. Never register or reuse the Production bot for Staging. Local validation uses synthetic values and does not invoke Telegram or Groq.

## Operations

Web process health uses `/api/health/live`; `/api/health/ready` separately proves deployment configuration, database connectivity, and migration state. PostgreSQL uses `pg_isready`. Workers have no fake health endpoint: running process state and structured lifecycle logs are the current liveness evidence.

Long-running application services use a bounded `on-failure:5` restart policy so invalid startup configuration remains visible instead of looping forever. PostgreSQL and Caddy use `unless-stopped`; migration uses `no`. Worker shutdown grace defaults to 90 seconds so SIGTERM can finish a bounded iteration and close its pool.

Each service has overrideable CPU/memory/PID limits and `json-file` rotation (10 MiB, three files by default). These are initial protections for a 4-vCPU/8-GiB host, not capacity guarantees; tune them from observed memory, CPU, latency, backlog, and provider-deadline behavior.

## Safe local validation

Create a disposable directory outside the checkout with synthetic files matching `runtime.env.example`. Use an unshared image tag, bind the edge to high local ports, and use a unique Compose project override only for validation if parallel isolation is needed. Then:

1. Run `docker compose ... config` and inspect resolved resources, logging, ports, secrets, networks, and volumes.
2. Build the three runtime targets.
3. Start only PostgreSQL and wait for its health check.
4. Run the explicit migration profile once.
5. Start web and the three workers, but not Caddy. Verify live/ready, noindex headers, restrictive robots, non-root identities, empty-queue worker stability, private ports, and network attachments.
6. Validate Caddy without starting it: `docker compose ... run --rm --no-deps edge caddy validate --config /etc/caddy/Caddyfile`.
7. Send SIGTERM with `docker compose ... stop` and verify graceful worker logs.

Do not run `down -v`, `docker volume prune`, or any broad cleanup. Report and leave every validation volume in place unless deletion is separately approved.

## Future first-server sequence

The future manual deployment is: provision and harden Linux/SSH/firewall/operator access; install Docker Engine and Compose; create `/opt/yolpol/staging`; copy repository-managed files; create restricted non-secret and secret files; prepare the dedicated Staging database identity; build/load immutable images; start PostgreSQL; run the explicit migration; start web/workers; verify live and ready; validate then activate Caddy; point Staging DNS; obtain TLS; and perform manual acceptance. None of the host hardening, DNS, TLS, server access, GitHub environments/secrets, or external credential setup is performed by this feature.
