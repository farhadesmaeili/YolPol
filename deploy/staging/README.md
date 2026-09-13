# YOLPOL Staging Compose

This directory is the repository-managed deployment definition for the future `https://staging.yolpol.com` environment. It does not deploy a host, modify DNS, contact Cloudflare, or request a certificate by itself.

Use Compose project `yolpol-staging`; the top-level `name` already enforces it. Do not add `container_name` or reuse these volumes, networks, database credentials, or Caddy state for Production.

## Host files and privilege boundary

The authoritative VPS ownership, restricted-wrapper, sudoers, lock, audit, and incoming-artifact contract is in `deploy/operations/README.md`. The Staging portion remains:

```text
/opt/yolpol/
  staging/
    compose.yaml              repository-managed copy
    Caddyfile                 repository-managed copy
    runtime.env               generated non-secret deployment settings
    secrets/                  root-controlled generated secret material
      postgres.env
      app-database.env
      migration-database.env
      backup-database.env
      restore-database.env          created only for an explicit recovery target
      backup-age-identity           mounted only for deep verification/recovery
      telegram-bot-token
      telegram-webhook-secret
      groq-api-key
    backups/                  encrypted artifacts and adjacent manifests only
```

Create `runtime.env` from `runtime.env.example`, copy its full Git revision and four immutable Staging image references from one authenticated and checksum-verified release manifest, and keep it outside Git. Monitoring consumes that manifest's fifth Operations Metrics ref. A checksum supplied beside an operator upload is not authentication; follow the root promotion procedure in `deploy/operations/README.md`. SemVer tags are readable aliases only. Deployment must use `repository@sha256:digest` values and the root-owned restricted wrapper, which adds `--no-build` to Compose `up` operations; it must never use `latest` or rebuild a release on the server. One-off Compose `run` operations omit that unsupported flag and remain image-only because the promoted Compose definition contains no `build` metadata. Local validation may omit the image variables only after explicitly building the fixed `:local` image names.

The `secrets` directory is `root:root` mode `700` and is not operator-readable. Database env files are `root:root` mode `400` because root-run Compose consumes them. Compose file-backed secrets are read-only bind mounts and do not portably honor target `uid`, `gid`, or `mode`; files mounted into first-party containers are therefore owned by the dedicated container-only UID/GID `10001:10001` with mode `400` inside the root-only parent. Do not create a host login with that identity or weaken file permissions. Verify this exact non-root read path on the target host before activation.

`postgres.env` contains only the PostgreSQL image initialization variables `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. The application, migration, backup, and explicit restore-target database environment files each contain only a complete `DATABASE_URL`. Do not place any of those values in `runtime.env`, Compose YAML, shell history, or Git. `restore-database.env` must identify a separately provisioned empty recovery database, never the currently active Staging database.

This foundation does not create a role bootstrap mechanism. Initially the migration and application URLs may refer to the same dedicated Staging owner role. That is not least privilege. A future role split must deliberately provision ownership, migration, and runtime grants before different credentials are configured; merely changing the URLs is unsafe.

## Images and services

The root Dockerfile has four runtime targets:

- `runtime`: unchanged Next.js standalone web artifact, Node 22 Bookworm slim, UID/GID 10001, `node server.js`.
- `worker-runtime`: production dependencies plus `tsx`, worker entrypoints, `tsconfig.json`, and their application source; direct Node commands run as UID/GID 10001.
- `migration-runtime`: production Drizzle/pg dependencies, committed SQL/journal, and the migration runner; runs as UID/GID 10001.
- `operations-runtime`: the pinned PostgreSQL 17.6 Alpine runtime plus `age`, `jq`, and the backup/restore entrypoint; runs as UID/GID 10001 and contains no application source or private identity.

Compose runs `edge`, `web`, `postgres`, `inquiry-notifications`, `conversation-translation`, and `conversation-ai-fallback`. `migrate` is a profile-gated one-shot tool. Backup, verification, retention, and restore services are also profile-gated one-shot tools. None starts during a normal `up`.

## Local build and future release order

The direct Compose commands below are for local validation or interactive root recovery. On the real VPS, `yolpol-operator` uses only `/opt/yolpol/bin/yolpol-deploy`; it never runs Docker or Compose directly. Run local/root commands from this directory, using the host-only settings file:

```sh
docker build --target runtime --tag yolpol-web:local ../..
docker build --target worker-runtime --tag yolpol-worker:local ../..
docker build --target migration-runtime --tag yolpol-migration:local ../..
docker build --target operations-runtime --tag yolpol-backup-restore:local ../..
docker compose --env-file /opt/yolpol/staging/runtime.env --no-build up -d postgres
docker compose --env-file /opt/yolpol/staging/runtime.env --profile backup run --rm backup-create
docker compose --env-file /opt/yolpol/staging/runtime.env --profile backup run --rm backup-verify verify <backup-id>
docker compose --env-file /opt/yolpol/staging/runtime.env --profile backup run --rm backup-deep-verify deep-verify <backup-id>
# Copy the encrypted artifact and manifest off-server, verify the copied pair, and confirm remote durability.
docker compose --env-file /opt/yolpol/staging/runtime.env --profile migration run --rm migrate
docker compose --env-file /opt/yolpol/staging/runtime.env --no-build up -d web inquiry-notifications conversation-translation conversation-ai-fallback
docker compose --env-file /opt/yolpol/staging/runtime.env --no-build up -d edge
```

The four explicit `docker build` commands are local validation only and use the repository root (`../..`) as their build context. They are deliberately separate from the deployment Compose contract. On the server, do not copy the source tree or Dockerfile; verify the release manifest checksum, populate its digest refs, and use `docker compose --env-file /opt/yolpol/staging/runtime.env --no-build pull`. The full release, promotion, pre-migration backup, and rollback procedures live in `deploy/release/README.md`.

The migration runner uses the committed Drizzle migrations and holds a PostgreSQL advisory lock for the entire operation. A second migration waits rather than racing. Migration failure exits non-zero; no application service mutates the schema. Readiness remains responsible for rejecting a database older than `0022_global_translation_settings`. Production must treat the backup, verification, off-server durability confirmation, migration, and readiness checks as one explicit release gate; backup is never hidden inside application or migration startup.

Start Caddy only after the host, firewall, DNS, and Staging acceptance prerequisites are ready. The committed Caddyfile activates automatic HTTPS when Caddy is actually started for `staging.yolpol.com`; configuration validation alone does not request a certificate.

## Network, ports, and persistence

- `edge`: non-internal Caddy-to-web network; web can also make the outbound Telegram response needed by onboarding.
- `backend`: internal-only PostgreSQL network used by web, workers, and migration. PostgreSQL has no published port.
- `provider_egress`: non-internal worker egress for Telegram/Groq. It does not contain PostgreSQL or Caddy.
- Only Caddy publishes host ports 80 and 443 (TCP, plus UDP 443 for HTTP/3). Web 3000 and PostgreSQL 5432 remain private.
- `postgres_data`, `caddy_data`, and `caddy_config` are Compose-project-scoped persistent volumes. They are not shared with Development or Production.

The PostgreSQL volume/database is protected by logical backup tooling; the Docker volume itself is not a backup. Monitoring, alerting, registry promotion, release automation, and cutover automation remain out of scope.

## Backup artifacts and verification

The backup service uses the same pinned PostgreSQL 17.6 image as the database and streams `pg_dump --format=custom` directly into recipient-based `age` encryption. Plaintext archives are not written to the backup mount. The final pair is:

```text
yolpol-staging-YYYYMMDDTHHMMSSZ-<git-revision>.dump.age
yolpol-staging-YYYYMMDDTHHMMSSZ-<git-revision>.manifest.json
```

The version-1 manifest records the safe environment/revision, PostgreSQL tool/server versions, custom dump format, `age-x25519`, encrypted filename/size/SHA-256, and migration marker. It contains no database address, username, password, private-key path, provider credential, customer data, counts, or pricing. Creation uses restrictive permissions and same-directory partial files; the encrypted artifact is renamed into its final path only after dump, encryption, checksum, and manifest creation succeed.

There are three distinct validation levels:

1. `backup-verify verify <backup-id>` needs no database or identity and checks format version, strict pairing, size, and SHA-256. Use it against an off-server copy as well as the local pair.
2. `backup-deep-verify deep-verify <backup-id>` additionally decrypts to a pipe and runs `pg_restore --list`; it needs the read-only identity file but writes no plaintext archive.
3. A full recovery exercise restores into a separate empty disposable database and performs the post-restore schema checks. A successful `pg_dump` alone is not proof of recovery.

The backup directory is a narrow bind mount. On Linux create `/opt/yolpol/staging/backups` for the container-only UID/GID `10001:10001` with mode `700`, beneath the root-owned non-operator-writable Staging parent; completed files remain mode `600`. Operators access backup creation and identity-free verification only through the restricted wrapper. Do not use `777`. Encrypted backups remain sensitive operational assets.

`YOLPOL_STAGING_BACKUP_AGE_RECIPIENT` is public configuration. `backup-age-identity` is secret recovery material and is mounted read-only only into deep-verification and restore services. A Production recovery identity must be held securely outside the application server; it must never exist only beside the database and local backups. The image, repository, manifest, and shell history must never contain the private identity.

## Restore guardrails

Provision a distinct empty recovery database and put only its URL in the restricted `restore-database.env`. Then run:

```sh
docker compose --env-file /opt/yolpol/staging/runtime.env --profile restore run --rm \
  -e YOLPOL_RESTORE_CONFIRMATION=RESTORE_TO_EMPTY_DATABASE \
  restore restore <backup-id>
```

The restore command validates the manifest/checksum, proves decryption and archive structure, connects to the explicit target, rejects any target containing a non-system relation, restores with `--exit-on-error --no-owner --no-privileges --single-transaction`, and checks the Drizzle journal through `0022_global_translation_settings` plus critical application tables. It never drops a database, cleans an existing schema, removes a volume, targets the active database implicitly, runs migrations, or performs cutover. If an older structurally valid backup is below the application migration requirement, keep it isolated, deliberately run the normal forward-migration job against that recovery database, revalidate it, and only then plan a separate controlled cutover.

## Retention and off-server durability

Local retention keeps the newest 14 verified Staging pairs by default. It is a separate operation and defaults to dry-run:

```sh
docker compose --env-file /opt/yolpol/staging/runtime.env --profile backup run --rm backup-retention
```

After reviewing candidates, deletion requires both an explicit mode and acknowledgement:

```sh
docker compose --env-file /opt/yolpol/staging/runtime.env --profile backup run --rm \
  -e YOLPOL_BACKUP_RETENTION_MODE=delete \
  -e YOLPOL_BACKUP_RETENTION_CONFIRMATION=DELETE_OLD_VERIFIED_BACKUPS \
  backup-retention
```

Retention examines only strict, non-symlink, checksum-valid YOLPOL artifact/manifest pairs inside the configured directory, never traverses directories, ignores ambiguous/orphaned/partial files, and always keeps at least one newest valid pair. It does not prove that a remote copy exists, so operators must not enable deletion until the off-server workflow has copied both files, verified the copied pair, and confirmed provider durability.

No storage vendor is configured here. The provider-neutral remote unit is exactly the encrypted artifact plus its manifest. A remote process must copy both, run the same identity-free integrity verification against the destination, obtain a durable-write confirmation appropriate to that provider, and record operational evidence before local retention is allowed. Local disk alone is not disaster recovery.

An initial configurable operating proposal for this B2B Inquiry service is a logical backup every six hours, an additional backup before every migration, at least 14 verified local pairs, prompt off-server replication, and a regular disposable restore exercise. The business owner must select the real schedule from its acceptable recovery-point window: a six-hour schedule can still lose up to roughly six hours of committed data. Restore time varies with archive size, transfer time, database capacity, validation, and cutover, so no fixed RTO or zero-data-loss claim is made. WAL archiving and point-in-time recovery are not implemented; they are a later Production hardening option if volume and recovery requirements justify them.

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

The future manual deployment is: provision and harden Linux/SSH/firewall/operator access; install Docker Engine and Compose; install the root-owned restricted wrapper and narrow sudoers rule; create the documented `/opt/yolpol` ownership hierarchy; copy reviewed repository-managed files; create restricted non-secret and secret files; prepare the dedicated Staging database identity; pull approved immutable images; start PostgreSQL; run the explicit migration; start web/workers; verify live and ready; validate then activate Caddy; point Staging DNS; obtain TLS; and perform manual acceptance. None of the host hardening, DNS, TLS, server access, GitHub environments/secrets, or external credential setup is performed by this feature.
