# YOLPOL Production deployment contract

This directory is the repository-managed foundation for the canonical `https://yolpol.com` environment. It defines files that a later root bootstrap installs below `/opt/yolpol/production`; it does not create that directory, access a server, deploy containers, create credentials, change DNS, contact Cloudflare, obtain certificates, or register a Telegram webhook.

## Fixed identity and isolation

Production uses Compose project `yolpol-production`, `YOLPOL_DEPLOYMENT_ENVIRONMENT=production`, and `YOLPOL_APP_ORIGIN=https://yolpol.com`. The project name and origin are source-controlled and policy-validated; callers cannot select an environment, project, Compose file, runtime file, service, image, or host path.

Production owns distinct backend/provider networks and database volumes, `/opt/yolpol/production/runtime.env`, `/opt/yolpol/production/secrets`, `/opt/yolpol/production/backups`, database credentials, age recipient/recovery identity, Telegram bot/webhook secret, provider credentials, and `/opt/yolpol/releases/production/active` release authority. Its web service alone also joins fixed external network `yolpol-production-ingress` as `production-web`; that network carries no database or worker. None of Production's private state may be copied from, mounted by, or shared with Staging. Production may retain an older approved manifest while Staging advances; promoting Staging never rewrites Production authority or runtime refs.

## Filesystem contract

The future root bootstrap must create this deterministic layout without making trusted paths operator-writable:

```text
/opt/yolpol/                                      root:root 0755
  releases/                                       root:root 0700
    production/                                   root:root 0700
      active/                                     root:root 0700
        release-manifest.json                     root:root 0600
        release-manifest.sha256                   root:root 0600
  production/                                     root:root 0750
    compose.yaml                                  root:root 0644
    runtime.env                                   root:root 0600
    secrets/                                      root:root 0700
      postgres.env                                root:root 0400
      app-database.env                            root:root 0400
      migration-database.env                      root:root 0400
      backup-database.env                         root:root 0400
      restore-database.env                        root:root 0400, only for an explicit recovery target
      telegram-bot-token                          10001:10001 0400
      telegram-webhook-secret                     10001:10001 0400
      groq-api-key                                10001:10001 0400
      backup-age-identity                         10001:10001 0400, recovery operations only
    backups/                                      10001:10001 0700
  runtime/
    production-last-backup-created-at             root:root 0600
```

The existing root-owned release, lock, audit, protected operation-log, and incoming paths remain authoritative as documented in `deploy/operations/README.md`. `yolpol-operator` must not own Production files, join the Docker group, read the Docker socket or secrets, or receive arbitrary Docker, Compose, shell, service, log, systemd, firewall, or file-selection access.

## Release and runtime authority

`runtime.env` is created from `runtime.env.example` only after root independently selects an authenticated GitHub Release and verifies its strict manifest/checksum, source repository, full Git SHA, platform, database migration identity/fingerprint, five roles, repositories, and immutable digests. Root promotes that pair only to `/opt/yolpol/releases/production/active`; Production validation never reads the Staging active directory. The `.sha256` file detects corruption; it does not authenticate attacker-controlled uploads.

The four Production image values must be exact `repository@sha256:digest` references from that one manifest. The Compose file has no `build` section and no local or floating first-party fallback. It never accepts `latest`. PostgreSQL remains a separately digest-pinned upstream image; Caddy belongs only to the independent shared-ingress project. Server-side source builds are unsupported.

The closed runtime schema contains only non-secret image/revision identity, fixed Production paths/origins, public-safe Telegram username, public age recipient, and bounded resource/logging settings. Unknown, duplicate, empty, unsafe, `COMPOSE_*`, and `DOCKER_*` inputs fail policy validation. Secrets remain in the root-controlled files referenced by the schema and never enter Git, `runtime.env`, documentation values, command arguments, or logs.

## Runtime and network model

Ordinary startup consists only of `web`, `postgres`, `inquiry-notifications`, `conversation-translation`, and `conversation-ai-fallback`. Migration, backup, restore, Staff, and Telegram operations are profile-gated and never start as a side effect of normal `up`. There is no Production-local edge service.

- No Production service publishes a host port; shared ingress owns 80/443 independently.
- Web is reachable only as `production-web` on `yolpol-production-ingress` and uses the internal backend network for PostgreSQL. PostgreSQL has no host port and never joins ingress.
- Provider-capable workers use the separate provider-egress network. PostgreSQL and Staff operations do not.
- Telegram operations receive only their required Telegram files and provider egress; they receive no database URL or Groq key.
- No service uses host networking, privileged mode, devices, added capabilities, or a Docker socket.
- Every first-party process is fixed to non-login UID/GID `10001:10001`, drops all capabilities, and uses `no-new-privileges`; one-shot operations also use read-only roots and bounded private tmpfs.
- Memory, CPU, PID, shutdown, restart, and rotated JSON-log limits are explicit and policy-validated.

## Database, migration, backup, and recovery

Production PostgreSQL has its own volume and initialization credentials. Application, migration, backup, and explicit restore-target URLs are separate files so least-privilege roles can be provisioned. Web and workers never migrate automatically. The controlled release order is:

```text
authenticated release and exact manifest promotion
-> current health/readiness
-> encrypted Production backup
-> identity-free backup verification
-> deep verification and off-server durability confirmation by root
-> explicit migration only when the manifest/database gate requires it
-> exact web and worker digest deployment
-> readiness and operational verification
-> stop before public activation until the shared-host ingress prerequisite is complete
-> deployment record
```

Backups are `yolpol-production-...dump.age` plus adjacent manifests under the Production-only directory. Creation streams a PostgreSQL custom archive through age encryption without persistent plaintext. The age recipient is Production-specific. The private recovery identity is never committed and must have a separately protected off-server copy; keeping the only copy on the active application server is prohibited.

Before the first migration, backup creation accepts a genuinely pristine database with zero non-system user relations and records `schema.latestMigrationTimestamp=0`. Absence of `drizzle.__drizzle_migrations` alone is not evidence of a pristine database: if any user relation exists without that migration table, creation fails closed without publishing a backup pair. Once migration tracking exists, backup creation retains the normal latest-timestamp query. This bootstrap allowance does not relax the strict post-restore migration and required-schema validation for normal recovery.

The restricted operator surface permits Production backup creation and identity-free verification only. Deep verification, restore, retention deletion, recovery cutover, and private-identity access remain root-only. Restore requires a separate explicit empty target and the existing exact confirmation guard; it never drops a database or performs automatic rollback. Application rollback and database recovery are separate decisions: only an equal migration fingerprint permits automatic application-only rollback planning; otherwise stop for manual schema review.

## Telegram, providers, and Staff

Production requires a bot token and webhook secret that are not used by Staging. Telegram permits one webhook URL per bot, so sharing a bot would allow one environment to replace the other's webhook. The fixed Production webhook origin is `https://yolpol.com`. The public-safe bot username is non-secret; token and webhook secret remain file-backed.

Groq and future provider credentials are Production-only file-backed secrets. This Compose contract does not change provider-neutral application policy or routing. Staff provisioning and first-Super-Admin bootstrap reuse the existing authoritative CLIs as explicit interactive one-shot operations with real stdin/stdout/stderr TTYs, backend-only access, no provider egress, no provider secret, and no public port.

## Shared ingress and activation prerequisites

The dedicated `yolpol-ingress` project serves the canonical apex and permanently redirects `www.yolpol.com` to the matching apex path. Its Caddy state is neither Production application state nor shared with legacy Staging Caddy.

Production's former gated local edge has been removed, so starting normal Production services cannot stop, rebind, or compete with Staging/shared ingress. A Production web container can be replaced on the stable external network without restarting ingress.

Task 0064 defines the shared ingress and migration/rollback contract, and the current VPS migration completed successfully on 2026-09-19. The live Cloudflare redirect `yolpol.com -> staging.yolpol.com` remains active. Production public activation is still blocked until the Production runtime, secrets, database, release authority, application containers, Monitoring integration, health checks, and rollback are ready and the DNS/Cloudflare cutover is separately approved. Shared ingress alone does not make Production live.

## Operator commands and root responsibilities

The wrapper exposes explicit `production-*` commands for validation, status, health, pulling approved Production images, database/app/worker deployment, migration, Staff operations, Telegram webhook set/info, and backup create/verify. `production-deploy-edge` is intentionally rejected. There is no generic `--environment`, path, service, image, Compose, or arbitrary argument channel. Existing unprefixed commands remain Staging/Monitoring operations.

Root remains responsible for bootstrap, authenticated release promotion, runtime and secret creation/rotation, database-role provisioning, deep verification, off-server durability, retention, restore/recovery, Monitoring activation, firewall/DNS/TLS, registry authentication, emergency work, and installation of the wrapper/sudoers contract.

## Monitoring decision

The current `yolpol-monitoring` project remains application-data-specific to Staging. It identifies shared-ingress container presence and probes Staging web through `staging-web`, but it does not attach the Production ingress/backend network or credentials and does not claim an active Production public probe. Production monitoring is a separate follow-up requiring isolated exporter credentials, endpoint probes, alert routing, and policy tests before activation.

## Future automation compatibility

A future bootstrap tool can install the fixed tree, owners, modes, runtime schema, secret destinations, external ingress network, separate release authorities, and wrapper without inferring hidden state. A future release workflow can promote an approved manifest only to Production, create and verify a backup, compare migration identity, pull exact digests, migrate conditionally, replace web/workers on stable networks, verify readiness, and leave shared ingress running. Neither automation phase is implemented here, and Production activation remains separately approved.

## Intentionally unsupported

This repository now provides the shared-host ingress contract but does not install it, deploy Production, create host paths/networks, secrets, credentials, a database, bot, webhook, certificate, DNS record, GitHub Environment, bootstrap workflow, deployment workflow, Production monitoring, backup schedule, off-server store, PITR, down migration, automatic database rollback, restore cutover, arbitrary logs, arbitrary Compose, or shell access.
