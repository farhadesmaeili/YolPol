# Staging Compose Deployment Foundation

## Goal and scope

This feature defines the reproducible single-host Docker Compose topology and operating contract for the future YOLPOL Staging environment at `https://staging.yolpol.com`. It adds no real deployment, DNS, Cloudflare, certificate, GitHub environment/secret, Production Compose, backup job, monitoring stack, registry publication, release automation, rollback mechanism, provider call, or application database migration.

The existing Development/Integration `compose.yaml` is unchanged. Staging is a separate Compose project named `yolpol-staging`; its containers, networks, volumes, database, credentials, and Caddy state are namespaced independently from Development and future Production.

## Topology and service inventory

```text
Internet -> Caddy edge -> Next.js web -> PostgreSQL
                             |
                             +-> outbound Telegram onboarding responses

Inquiry Notification worker ------> PostgreSQL + outbound Telegram
Conversation Translation worker ---> PostgreSQL + conditional outbound Groq
Conversation AI Fallback worker ---> PostgreSQL + conditional outbound Groq
Explicit migration job ------------> PostgreSQL
```

The active long-running services are `edge`, `web`, `postgres`, `inquiry-notifications`, `conversation-translation`, and `conversation-ai-fallback`. `migrate` is an explicit one-shot profile. No generic channel-delivery service is activated, and Inquiry retention remains an operator-controlled one-shot command outside Compose.

## Runtime images

The final/default Docker target remains `runtime`, preserving the existing Node 22 Bookworm-slim Next.js standalone image, UID/GID 1001, port 3000, and `node server.js`. Its runtime content remains `public`, `.next/standalone`, `.next/static`, and writable `.next/cache`; no deployment secret or source checkout is added.

`worker-runtime` installs the frozen lockfile, prunes to production dependencies, and contains only production modules, package/TypeScript resolution metadata, `tooling/workers`, and non-test `src` content. Direct `node --conditions=react-server --import tsx` commands retain the existing `server-only`, polling, structured logging, bounded work, lease/fencing, retry, SIGINT/SIGTERM, and pool-close behavior. Each worker is a separate container and runs as UID/GID 1001.

`migration-runtime` contains the same production-only dependency set plus committed Drizzle SQL/journal and a small Node migrator. The existing `drizzle-kit migrate` command remains available for development tooling but is not shipped because `drizzle-kit` is a development dependency. Runtime migration uses `drizzle-orm/node-postgres/migrator` and `pg` without changing migration ordering or the `drizzle.__drizzle_migrations` contract.

## Explicit migrations and serialization

The migration job receives only `DATABASE_URL`, applies committed migrations, and exits 0/1. It holds one PostgreSQL advisory lock on a single-connection pool for the whole runtime migration. Concurrent invocations therefore serialize without a lock table or schema change; PostgreSQL releases the lock if the session dies.

The release order is PostgreSQL health, explicit migration, application services, readiness verification, then edge activation. `migrate` has the `migration` profile and `restart: no`; normal `docker compose up` does not start it. Web/workers do not depend on successful migration execution and never mutate schema. `/api/health/ready` continues to require journal state through `0022_global_translation_settings`; liveness remains database-independent.

No new SQL migration is introduced. The initial Compose contract uses one dedicated Staging owner role for both runtime and migration unless operators provision a deliberate privilege split separately. This is documented honestly as not least privilege; Compose does not simulate a role split with brittle initialization scripts.

## Networks, ports, volumes, and egress

`backend` is internal and connects PostgreSQL, web, all workers, and migration. `edge` connects only Caddy and web and permits the web process's required outbound access. `provider_egress` connects only the workers that may call Telegram/Groq and permits outbound Internet access. PostgreSQL and migration have no egress-capable network.

Only Caddy publishes ports: configurable host bindings default to TCP 80, TCP 443, and UDP 443. Web 3000, PostgreSQL 5432, and all workers are private. The isolated persistent volumes are `postgres_data`, `caddy_data`, and `caddy_config`; application code/data has no persistent or writable source mount. The Staging PostgreSQL database/volume is the exact future backup target, but it is unprotected until the backup/restore feature is implemented.

## Secrets and server filesystem contract

Repository-managed files are `deploy/staging/compose.yaml`, `Caddyfile`, `README.md`, and `runtime.env.example`. The intended `/opt/yolpol/staging` host tree contains copies of the first two, a generated non-secret `runtime.env`, a restricted `secrets` directory, and a future `backups` directory. Production will use `/opt/yolpol/production` and separate state.

The PostgreSQL initialization env file holds `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. Application and migration env files hold only their respective complete `DATABASE_URL`; `DATABASE_URL_FILE` remains intentionally absent. Telegram bot token, Telegram webhook secret, and Groq key retain the existing `_FILE` contract and are mounted read-only under `/run/secrets` only into consumers that need them.

Secret directories should be mode `700`; source files should be mode `600` or equivalently inaccessible to unrelated users. Compose file secrets are read-only bind mounts and do not portably implement target UID/GID/mode. On Linux, the deployment service identity should own them as host UID/GID 1001, or a restrictive ACL/group mapping must grant container UID 1001 read access. That exact non-root path must be verified on the target host before activation. No secret is copied into any image, committed, placed in public configuration, or shared with Production.

## Staging runtime and external providers

Every application service uses `NODE_ENV=production`, `YOLPOL_DEPLOYMENT_ENVIRONMENT=staging`, `YOLPOL_APP_ORIGIN=https://staging.yolpol.com`, `YOLPOL_LOG_LEVEL=info`, and an immutable hexadecimal `YOLPOL_GIT_REVISION`. Production canonical identity remains `https://yolpol.com`.

Existing deployment behavior keeps Staging non-indexable: global `X-Robots-Tag: noindex, nofollow, noarchive`, restrictive `/robots.txt`, and an empty sitemap. Caddy adds no duplicate application security headers, CSP, or HSTS policy.

Staging Telegram activation requires a separate bot because one bot can have only one webhook URL. Synthetic local secrets are format-safe, and an empty queue causes no Telegram call. Translation/AI credential resolution stays behind persisted provider eligibility; empty queues make no Groq call. No model, prompt, retry, policy, or provider behavior changes.

## Caddy, TLS, and DNS

Caddy is the minimal edge proxy for `staging.yolpol.com` and forwards to `web:3000`. Caddy natively preserves reverse-proxy forwarding and streaming/WebSocket behavior needed by Next.js. Its data and config volumes are Staging-only so later Production cannot share certificate state accidentally.

Starting the real edge with public DNS would activate automatic HTTPS. Local validation only parses/validates the Caddyfile and does not start the edge, contact ACME, request a certificate, or change DNS. HSTS subdomain/preload and CSP remain deferred until an explicit domain/application policy exists.

## Resource, restart, logging, and health policy

Default limits reserve substantial capacity on a 4-vCPU/8-GiB host: PostgreSQL 1 GiB/0.75 CPU, web 768 MiB/0.75 CPU, each worker 384 MiB/0.25 CPU, Caddy 256 MiB/0.20 CPU, and temporary migration 512 MiB/0.50 CPU. PID caps are also configured. All are environment-overridable and must be tuned using real measurements rather than treated as Production sizing.

PostgreSQL and Caddy use `unless-stopped`. Application processes use bounded `on-failure:5` so invalid configuration does not create an infinite restart loop. Migration never restarts. Docker JSON logs rotate at 10 MiB with three files by default; structured application logs stay on stdout/stderr. No central log shipping exists yet.

Web health calls `/api/health/live` with Node already in the image. PostgreSQL uses `pg_isready`. Readiness remains an external rollout/traffic check at `/api/health/ready`. Workers expose no fake endpoint; container process state and redacted structured lifecycle logs are their current liveness evidence.

## Validation and cleanup contract

Local validation uses only synthetic credentials, a disposable database identity, high edge ports, isolated image tags, and an isolated Compose project. It validates Compose rendering, all image targets, explicit migration, live/ready, Staging robots/noindex, worker stability and non-root identities, ports, networks, volumes, secret/image contents, Caddy syntax, and graceful SIGTERM. Empty queues ensure no provider request is initiated.

Validation must never use `.env.local`, the Development database, real Telegram/Groq credentials, or real Staging/Production material. Do not run `down -v`, `docker volume prune`, or broad cleanup. Any created validation volume is reported by exact name and left in place until separately approved for deletion.

## Deferred first-server runbook

The future operator sequence is: provision Linux; harden SSH/firewall/operator identity; install Docker/Compose; create `/opt/yolpol/staging`; copy repository-managed files; generate restricted configuration/secrets; provision Staging database credentials; build/load immutable images; start PostgreSQL; run explicit migration; start workers/web; verify health/readiness; validate and activate Caddy; point `staging.yolpol.com`; obtain TLS; then perform acceptance.

Server hardening, access, DNS, certificates, Cloudflare, GitHub deployment environments/secrets, GHCR, backups/restores, monitoring/alerts, release promotion, and rollback are explicitly deferred. The current CI workflow and required job names remain unchanged and continue to require no real secret.
