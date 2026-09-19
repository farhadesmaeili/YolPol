# YOLPOL Production deployment contract

This directory is the repository-managed foundation for the canonical `https://yolpol.com` environment. It defines files that a later root bootstrap installs below `/opt/yolpol/production`; it does not create that directory, access a server, deploy containers, create credentials, change DNS, contact Cloudflare, obtain certificates, or register a Telegram webhook.

## Fixed identity and isolation

Production uses Compose project `yolpol-production`, `YOLPOL_DEPLOYMENT_ENVIRONMENT=production`, and `YOLPOL_APP_ORIGIN=https://yolpol.com`. The project name and origin are source-controlled and policy-validated; callers cannot select an environment, project, Compose file, runtime file, service, image, or host path.

Production owns distinct `yolpol-production_*` networks and volumes, `/opt/yolpol/production/runtime.env`, `/opt/yolpol/production/secrets`, `/opt/yolpol/production/backups`, database credentials, age recipient/recovery identity, Telegram bot/webhook secret, provider credentials, Caddy state, and `/opt/yolpol/releases/production/active` release authority. None may be copied from, mounted by, or shared with Staging. Production may retain an older approved manifest while Staging advances; promoting Staging never rewrites Production authority or runtime refs.

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
    compose.yaml, Caddyfile                       root:root 0644
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

The four Production image values must be exact `repository@sha256:digest` references from that one manifest. The Compose file has no `build` section and no local or floating first-party fallback. It never accepts `latest`. Caddy and PostgreSQL remain separately digest-pinned upstream images. Server-side source builds are unsupported.

The closed runtime schema contains only non-secret image/revision identity, fixed Production paths/origins, public-safe Telegram username, public age recipient, and bounded resource/logging settings. Unknown, duplicate, empty, unsafe, `COMPOSE_*`, and `DOCKER_*` inputs fail policy validation. Secrets remain in the root-controlled files referenced by the schema and never enter Git, `runtime.env`, documentation values, command arguments, or logs.

## Runtime and network model

Ordinary startup consists only of `web`, `postgres`, `inquiry-notifications`, `conversation-translation`, and `conversation-ai-fallback`. Migration, backup, restore, Staff, Telegram, and the blocked Production edge are profile-gated and never start as a side effect of normal `up`.

- No Production service publishes a host port until the shared-host ingress prerequisite is implemented.
- Web is private behind Caddy; PostgreSQL has no host port and uses the internal backend network.
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

The restricted operator surface permits Production backup creation and identity-free verification only. Deep verification, restore, retention deletion, recovery cutover, and private-identity access remain root-only. Restore requires a separate explicit empty target and the existing exact confirmation guard; it never drops a database or performs automatic rollback. Application rollback and database recovery are separate decisions: only an equal migration fingerprint permits automatic application-only rollback planning; otherwise stop for manual schema review.

## Telegram, providers, and Staff

Production requires a bot token and webhook secret that are not used by Staging. Telegram permits one webhook URL per bot, so sharing a bot would allow one environment to replace the other's webhook. The fixed Production webhook origin is `https://yolpol.com`. The public-safe bot username is non-secret; token and webhook secret remain file-backed.

Groq and future provider credentials are Production-only file-backed secrets. This Compose contract does not change provider-neutral application policy or routing. Staff provisioning and first-Super-Admin bootstrap reuse the existing authoritative CLIs as explicit interactive one-shot operations with real stdin/stdout/stderr TTYs, backend-only access, no provider egress, no provider secret, and no public port.

## Caddy and activation prerequisites

`Caddyfile` serves the apex canonical host and permanently redirects `www.yolpol.com` to the matching apex path. Its `caddy_data` and `caddy_config` volumes are Production-project state and never shared with Staging.

Staging currently owns the one VPS's public 80/443 listener. Two independent Compose Caddy projects cannot bind the same host IP/ports concurrently. The Production edge is therefore gated behind the `shared-ingress-prerequisite` profile, publishes no host ports, and has no wrapper activation command. Starting normal Production services cannot stop, rebind, or compete with Staging, but it also cannot make `https://yolpol.com` available.

Task 0064 must create the reviewed shared-host ingress authority, route both canonical hosts to isolated environment backends, define TLS/state ownership, safely migrate the verified Staging listener, and add bootstrap/policy/rollback validation. Until then, real Production deployment on the one-VPS topology is blocked before ingress activation. This repository change does not alter the current redirect, DNS, Cloudflare, or certificate state.

## Operator commands and root responsibilities

The wrapper exposes explicit `production-*` commands for validation, status, health, pulling approved Production images, database/app/worker deployment, migration, Staff operations, Telegram webhook set/info, and backup create/verify. `production-deploy-edge` is intentionally rejected. There is no generic `--environment`, path, service, image, Compose, or arbitrary argument channel. Existing unprefixed commands remain Staging/Monitoring operations.

Root remains responsible for bootstrap, authenticated release promotion, runtime and secret creation/rotation, database-role provisioning, deep verification, off-server durability, retention, restore/recovery, Monitoring activation, firewall/DNS/TLS, registry authentication, emergency work, and installation of the wrapper/sudoers contract.

## Monitoring decision

The current `yolpol-monitoring` project is deliberately Staging-specific: it mounts Staging networks/backups and uses Staging PostgreSQL and Operations Metrics credentials. This feature leaves it byte-for-byte unchanged and does not attach Production networks or credentials to it. Production monitoring is a separate follow-up that must explicitly design isolated exporter credentials, network attachment, backup signals, endpoints, alert routing, and policy tests before activation. Production must not be declared operationally ready until that follow-up and acceptance are complete.

## Future automation compatibility

A future bootstrap tool can install the fixed tree, owners, modes, Compose/Caddy files, runtime schema, secret destinations, separate Staging/Production release authorities, and wrapper without inferring hidden state. A future release workflow can promote an approved manifest only to its fixed environment, create and verify a backup, compare migration identity, pull exact digests, migrate conditionally, deploy fixed private services, verify readiness, and record the result through the closed command surface. It must stop before Production ingress until Task 0064 is complete. Neither automation phase is implemented here, and normal release operation still requires root-controlled promotion and approval.

## Intentionally unsupported

This foundation does not provide shared-host Production ingress, deploy Production, create host paths, secrets, credentials, a database, bot, webhook, certificate, DNS record, GitHub Environment, bootstrap workflow, deployment workflow, monitoring stack, backup schedule, off-server store, PITR, down migration, automatic database rollback, restore cutover, arbitrary logs, arbitrary Compose, or shell access.
