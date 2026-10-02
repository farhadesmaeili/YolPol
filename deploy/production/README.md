# YOLPOL Production deployment contract

This directory is the repository-managed foundation for the canonical `https://yolpol.com` environment. It defines files installed below `/opt/yolpol/production`; repository source alone does not access a server, deploy containers, create credentials, change DNS, contact Cloudflare, obtain certificates, or register a Telegram webhook. Repository deployment records establish that the Production runtime, secrets, database, release authority, and application containers were provisioned and healthy at the `v0.2.2` milestone. Local Git history does not establish the currently deployed version. Runtime deployment remains distinct from the separately approved public DNS/Cloudflare cutover, which is not claimed as complete.

## Fixed identity and isolation

Production uses Compose project `yolpol-production`, `YOLPOL_DEPLOYMENT_ENVIRONMENT=production`, and `YOLPOL_APP_ORIGIN=https://yolpol.com`. The project name and origin are source-controlled and policy-validated; callers cannot select an environment, project, Compose file, runtime file, service, image, or host path.

`YOLPOL_PRODUCTION_GOOGLE_ANALYTICS_MEASUREMENT_ID` is a required, non-secret Production runtime value. Compose maps it to `YOLPOL_GOOGLE_ANALYTICS_MEASUREMENT_ID` only in the `web` service; it is absent from Staging and every worker or operation container. The application still keeps Google Analytics disabled until a visitor explicitly grants analytics consent.

Before activating Production GA4, an operator must verify the Google Analytics Web Stream setting **Enhanced Measurement -> Page views -> Show advanced settings -> Page changes based on browser history events** is disabled. YOLPOL emits its own allow-listed App Router `page_view` events; `send_page_view: false` does not disable that separate Google-side history setting. The repository does not configure or verify the Web Stream UI, and other Enhanced Measurement options do not need to be disabled for this prerequisite.

Production owns distinct backend/provider networks and database volumes, `/opt/yolpol/production/runtime.env`, `/opt/yolpol/production/secrets`, `/opt/yolpol/production/backups`, database credentials, age recipient/recovery identity, Telegram bot/webhook secret, provider credentials, and `/opt/yolpol/releases/production/active` release authority. Its web service alone also joins fixed external network `yolpol-production-ingress` as `production-web`; that network carries no database or worker. None of Production's private state may be copied from, mounted by, or shared with Staging. Production may retain an older approved manifest while Staging advances; promoting Staging never rewrites Production authority or runtime refs.

## Filesystem contract

Root bootstrap creates this deterministic layout without making trusted paths operator-writable:

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
      indexnow-key                                10001:10001 0400
      backup-age-identity                         10001:10001 0400, recovery operations only
    backups/                                      10001:10001 0700
  runtime/
    production-last-backup-created-at             root:root 0600
    offserver-durability-evidence/                 root:root 0700
      deployment-<deployment-id>.json              root:root 0600, only after full Phase C2 proof
```

The existing root-owned release, lock, audit, protected operation-log, and incoming paths remain authoritative as documented in `deploy/operations/README.md`. `yolpol-operator` must not own Production files, join the Docker group, read the Docker socket or secrets, or receive arbitrary Docker, Compose, shell, service, log, systemd, firewall, or file-selection access.

## Release and runtime authority

`runtime.env` is created from `runtime.env.example` only after root independently selects an authenticated GitHub Release and verifies its strict manifest/checksum, source repository, full Git SHA, platform, database migration identity/fingerprint, five roles, repositories, and immutable digests. Root promotes that pair only to `/opt/yolpol/releases/production/active`; Production validation never reads the Staging active directory. The `.sha256` file detects corruption; it does not authenticate attacker-controlled uploads.

The four Production image values must be exact `repository@sha256:digest` references from that one manifest. The Compose file has no `build` section and no local or floating first-party fallback. It never accepts `latest`. PostgreSQL remains a separately digest-pinned upstream image; Caddy belongs only to the independent shared-ingress project. Server-side source builds are unsupported.

The closed runtime schema contains only non-secret image/revision identity, fixed Production paths/origins, public-safe Telegram username, public age recipient, and bounded resource/logging settings. Unknown, duplicate, empty, unsafe, `COMPOSE_*`, and `DOCKER_*` inputs fail policy validation. Secrets remain in the root-controlled files referenced by the schema and never enter Git, `runtime.env`, documentation values, command arguments, or logs.

## Runtime and network model

Ordinary startup consists only of `web`, `postgres`, `inquiry-notifications`, `conversation-translation`, and `conversation-ai-fallback`. Migration, backup, restore, Staff, Telegram, and IndexNow operations are profile-gated and never start as a side effect of normal `up`. There is no Production-local edge service.

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
authenticated release and exact current/target validation
-> exact successful Staging ledger prerequisite
-> encrypted Production backup
-> identity-free backup verification
-> deep verification
-> fixed Windows OpenSSH SFTP ingress copy over private Tailscale transport
-> bounded canonical Windows volume-flush receipt validation and exact final durable-store readback
-> fixed RSA-PSS/SHA-256 authentication of the exact canonical receipt bytes
-> durable-write confirmation and exact canonical evidence validation
-> only then promote authority/runtime and deploy the database
-> explicit migration only when the manifest/database gate requires it
-> exact web and worker digest deployment
-> readiness and operational verification
-> stop before public activation until the shared-host ingress prerequisite is complete
-> deployment record
```

Backups are `yolpol-production-...dump.age` plus adjacent manifests under the Production-only directory. Creation streams a PostgreSQL custom archive through age encryption without persistent plaintext. The age recipient is Production-specific. The private recovery identity is never committed and must have a separately protected off-server copy; keeping the only copy on the active application server is prohibited. Phase C2 evidence binds the exact encrypted pair to the Deployment ID, current/target migration fingerprints, and authenticated target manifest. It contains only checksums, bounded identities, booleans, and a verification timestamp; it contains no credential, provider response, database URL, plaintext, or customer data.

Before the first migration, backup creation accepts a genuinely pristine database with zero non-system user relations and records `schema.latestMigrationTimestamp=0`. Absence of `drizzle.__drizzle_migrations` alone is not evidence of a pristine database: if any user relation exists without that migration table, creation fails closed without publishing a backup pair. Once migration tracking exists, backup creation retains the normal latest-timestamp query. This bootstrap allowance does not relax the strict post-restore migration and required-schema validation for normal recovery.

The restricted operator surface permits Production backup creation and identity-free verification only. Deep verification, restore, retention deletion, recovery cutover, and private-identity access remain root-only. Restore requires a separate explicit empty target and the existing exact confirmation guard; it never drops a database or performs automatic rollback. Application rollback and database recovery are separate decisions: only an equal migration fingerprint permits automatic application-only rollback planning; otherwise stop for manual schema review.

## Telegram, providers, and Staff

Production requires a bot token and webhook secret that are not used by Staging. Telegram permits one webhook URL per bot, so sharing a bot would allow one environment to replace the other's webhook. The fixed Production webhook origin is `https://yolpol.com`. The public-safe bot username is non-secret; token and webhook secret remain file-backed.

Groq and future provider credentials are Production-only file-backed secrets. This Compose contract does not change provider-neutral application policy or routing. Staff provisioning and first-Super-Admin bootstrap reuse the existing authoritative CLIs as explicit interactive one-shot operations with real stdin/stdout/stderr TTYs, backend-only access, no provider egress, no provider secret, and no public port.

## IndexNow

Production web alone receives the file-backed `indexnow_key` so it can serve the non-localized `/indexnow-key.txt` verification resource. The profile-gated `indexnow-submit` operation reuses the approved worker image, attaches only to provider egress, and receives the same key with no database, Telegram, Groq, backup, or recovery access. Staging has no IndexNow key, route exposure, service, or wrapper command.

For initial Production activation, run the fixed argument-free `production-indexnow-submit` operation once after the reviewed contracts, complete Production secrets including `INDEXNOW_KEY`, closed runtime, `check-production`, approved web recreation, and public key-resource verification are complete. The operation submits the same 76-entry canonical source consumed by `sitemap.xml`; it may also be selected deliberately when a release materially affects the whole public site. Do not invoke it automatically after every ordinary release.

Release-to-release changed-URL detection is intentionally deferred. A future integration should submit only added, updated, deleted, or otherwise materially changed URLs without adding URL arguments or another arbitrary operator surface. `sitemap.xml` remains the complete long-term inventory. `200` means submitted and `202` means accepted pending key validation; neither means indexed. IndexNow availability remains outside deployment correctness and rollback. See `docs/tasks/0068-indexnow-integration.md` for the exact activation order, rotation, and Bing Webmaster Tools verification.

## Shared ingress and activation prerequisites

The dedicated `yolpol-ingress` project serves the canonical apex and permanently redirects `www.yolpol.com` to the matching apex path. Its Caddy state is neither Production application state nor shared with legacy Staging Caddy.

Production's former gated local edge has been removed, so starting normal Production services cannot stop, rebind, or compete with Staging/shared ingress. A Production web container can be replaced on the stable external network without restarting ingress.

Task 0064 defines the shared ingress and migration/rollback contract, and the current VPS migration completed successfully on 2026-09-19. The `v0.2.2` deployment record established that the Production runtime, secrets, database, release authority, and application containers were provisioned and healthy; it is not a claim about the currently deployed release. The last verified repository record says the Cloudflare redirect `yolpol.com -> staging.yolpol.com` remained active, and this reconciliation has no evidence that it was removed. Task 0070 records Production Monitoring activation at the later `v0.2.3` milestone, while live verification of the released Prometheus proxy fix and a separately approved DNS/Cloudflare cutover remain outstanding. Runtime health and shared ingress alone do not prove public Production activation.

## Operator commands and root responsibilities

The wrapper exposes explicit `production-*` commands for validation, status, health, pulling approved Production images, database/app/worker deployment, migration, Staff operations, Telegram webhook set/info, IndexNow submission, and backup create/verify. `production-deploy-edge` is intentionally rejected. There is no generic `--environment`, path, URL, host, key, service, image, Compose, or arbitrary argument channel. Existing unprefixed commands remain Staging/Monitoring operations.

Root remains responsible for bootstrap, authenticated release promotion, runtime and secret creation/rotation, database-role provisioning, deep verification, off-server durability, retention, restore/recovery, Monitoring activation, firewall/DNS/TLS, registry authentication, emergency work, and installation of the wrapper/sudoers contract.

## Monitoring decision

The repository's single `yolpol-monitoring` project now defines isolated Production PostgreSQL, Operations, and Blackbox collectors. They use Production-only secret files, join only the Production backend or ingress network required by their function, label signals `environment="production"`, and probe only internal `production-web` liveness/readiness. Shared Prometheus, Alertmanager, Node Exporter, cAdvisor, host alerts, and the one shared-ingress presence alert are not duplicated. Production backup monitoring remains disabled by default.

This is primarily a repository contract. Task 0070 separately records that the Production monitoring role, credentials, host contract, and collectors were activated at the `v0.2.3` milestone; this branch does not infer their current deployed version. Public `https://yolpol.com` DNS/TLS monitoring remains deferred until cutover, and an independent off-host watchdog is still required for total VPS loss.

## Automation state and compatibility

The Phase B bootstrap installs the fixed tree, owners, modes, runtime schema, secret destinations, external ingress network, separate release authorities, and wrapper without inferring hidden state. The active Phase C1 workflow promotes an approved, same-fingerprint manifest to Production, pulls exact digests, replaces web/workers on stable networks, verifies readiness, and leaves shared ingress running. Task 0069 installs the root-owned Phase C2 core and evidence directory; Task 0071 adds fixed Windows SFTP transport/readback, its root-only directory, the unconfigured active JSON, and the OpenSSH client prerequisite; Task 0072 adds the repository-only Windows durable-copy/volume-flush receipt helper, runtime handle/ACL trust checks, strict receipt validation, and final durable-store readback; Task 0073 adds fixed detached receipt signing and VPS verification. The repository does not install the helper or its ACLs/Scheduled Task, create the CNG or SFTP private key, install pinned host/public-key trust, or configure a live destination. Production-changing migration fingerprints therefore remain blocked with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`. Public activation remains separately approved.

## Intentionally unsupported

The repository contract includes a Windows durable-write receipt primitive and fixed authenticated provenance, but neither authority is live: no CNG signing key or pinned VPS public key is provisioned. The activated host path also does not provide the Windows installation, ACLs, LocalSystem schedule, configured off-server destination, remote retention/cleanup, verified rollout of the released Prometheus proxy fix, public/off-host Production probing, PITR, down migrations, automatic database rollback/restore cutover, arbitrary logs, arbitrary Compose, or shell access. The repository source does not itself create credentials or host trust, configure Windows/Tailscale, upload a real backup, activate changed-fingerprint Production migration, change DNS/Cloudflare, or perform public activation; those remain controlled external operations.
