# Backup & Restore Operations

## Goal and scope

This feature adds a provider-neutral PostgreSQL logical-backup and recovery foundation for future Staging and Production operations. It does not access or deploy a server, read real credentials, upload an artifact, schedule a job, alter Production, touch Development data, delete a Docker volume, implement WAL/PITR, or add an application migration.

The protected Staging database uses `postgres:17.6-alpine` at the repository-pinned digest and persists in the Compose-scoped `yolpol-staging_postgres_data` volume. That volume is source state, not a backup. Backup operations read PostgreSQL over the private `backend` network and write only to the configured narrow backup-directory bind mount.

## Operations image

`operations-runtime` is a dedicated immutable image, not the web or PostgreSQL server runtime. A pinned Alpine 3.22 final stage receives the exact `pg_dump`, `pg_restore`, `psql`, `libpq`, and PostgreSQL shared data from the pinned PostgreSQL 17.6 stage, plus packaged `age` and `jq` and their runtime libraries. It contains no application source, Git metadata, `.env.local`, customer data, credential, or private recovery identity. Its entrypoint and all Compose operations run as UID/GID `1001:1001`, with a read-only root filesystem, a small tmpfs `/tmp`, all capabilities dropped, and `no-new-privileges`.

The validated final image is 24,490,797 bytes uncompressed. Its client reports `pg_dump (PostgreSQL) 17.6`; the selected encryption tool reports `age 1.2.1`.

## Backup artifact and atomic publication

`create` validates the trusted deployment environment (`development`, `staging`, or `production`), optional 7-64 character lowercase hexadecimal revision, database connection, PostgreSQL server/client major compatibility, and Drizzle migration state. It streams:

```text
pg_dump --format=custom --no-owner --no-privileges | age recipient encryption
```

No plaintext archive is written to persistent storage. Output is created with `umask 077` under a same-directory process-specific `.partial` name. A per-backup-ID directory lock prevents a same-name race. The encrypted bytes are checked, measured, and SHA-256 hashed; the partial manifest is generated and parsed; the manifest is renamed first; and the encrypted artifact is atomically renamed into its final name last. Failure and signal cleanup targets only the exact partials/lock owned by that invocation. A partial or incomplete pair is never accepted by verification.

The path-safe name is:

```text
yolpol-<environment>-YYYYMMDDTHHMMSSZ[-<revision>].dump.age
```

Its adjacent manifest is `<backup-id>.manifest.json`.

## Manifest version 1

The machine-readable manifest contains only:

- `formatVersion` (`1`)
- backup ID, UTC creation time, deployment environment, and optional application revision
- PostgreSQL major/server/client versions
- custom dump format and `age-x25519` encryption scheme
- encrypted artifact filename, byte size, and SHA-256
- latest Drizzle migration timestamp plus the required `0022_global_translation_settings` marker and timestamp `1788832991886`

It does not contain a database URL, host, username, password, secret/identity path or content, provider credential, customer content/count, or pricing. Verification rejects malformed JSON, unsupported versions, unsafe IDs, wrong pairing, missing/non-regular/symlinked files, directory escape, size mismatch, and checksum mismatch.

## Encryption and recovery-key ownership

Backup creation receives the public `YOLPOL_BACKUP_AGE_RECIPIENT`. Deep verification and restore receive the private identity through the read-only `YOLPOL_BACKUP_AGE_IDENTITY_FILE`; Staging Compose maps it from a file-backed secret and never puts its content into an image or environment variable. Real recovery identity material must be securely held outside the application server and must not exist only alongside the database and local backups. This feature neither generates nor commits a real key; validation creates and removes only disposable synthetic identities.

## Verification levels

1. `verify` requires no database and no private identity. It validates manifest version/schema/pairing, file type/location, encrypted size, and SHA-256. This is the required verification for a copied remote pair.
2. `deep-verify` first performs integrity verification, then streams `age` decryption into `pg_restore --list`. It proves access to the identity and valid custom-archive structure without writing plaintext or restoring a database.
3. A full restore exercise targets a separate disposable empty database and validates restored migration/schema state and a synthetic marker. Successful dump creation without these additional checks is not trusted recovery evidence.

## Restore safety and validation

`restore` requires all of the following:

- exact `YOLPOL_RESTORE_CONFIRMATION=RESTORE_TO_EMPTY_DATABASE`
- a backup ID that passes integrity and deep archive verification
- a readable, non-empty, non-symlink private identity file
- an explicit destination `DATABASE_URL` supplied through the separate restricted restore database env file
- a successful target connection with zero non-system relations

The target guard does not infer safety from its database name. Restore uses `pg_restore --exit-on-error --no-owner --no-privileges --single-transaction`; it does not use `--clean`, drop a database/schema, delete a volume, or infer the active Staging database as its target. Post-restore validation checks connectivity, the Drizzle migration timestamp at or beyond `0022`, and the presence of `inquiries`, `conversation_messages`, and `staff_accounts` without reading customer rows.

Backup restore and forward migration remain separate. If an older valid backup is below the current schema requirement, it remains isolated and unavailable to cutover until the normal explicit migration job is deliberately run against that recovery database and readiness is revalidated.

## Retention

`prune` is separate from `create`, keeps the newest 14 verified pairs by default, and requires a configured environment. Default mode is `dry-run`. Deletion additionally requires both `YOLPOL_BACKUP_RETENTION_MODE=delete` and exact `YOLPOL_BACKUP_RETENTION_CONFIRMATION=DELETE_OLD_VERIFIED_BACKUPS`.

Only strict, checksum-valid, non-symlink YOLPOL pairs for the configured environment are candidates. Retention never recurses, never follows a symlink, ignores partial/orphaned/ambiguous pairs, re-verifies immediately before deletion, and requires a keep count of at least one, so the newest valid backup is protected. It does not automatically know remote durability; enabling deletion remains an operator decision after off-server confirmation.

## Off-server and recovery contract

No vendor or transfer is configured. The provider-neutral copy unit is the encrypted `.dump.age` artifact plus its `.manifest.json`. A future remote process must copy both, run identity-free `verify` against the destination copy, confirm the provider's durable write, and preserve evidence before local retention is allowed. Deep verification/periodic restore testing remains additionally required. Local server storage alone is not disaster recovery.

The future Production pre-migration gate is:

```text
database health/readiness
-> create encrypted backup
-> integrity verification
-> optional immediate deep archive verification
-> off-server pair copy, destination verification, and durability confirmation
-> explicit migration job
-> application readiness
```

No backup is attached to web startup or hidden inside the migration runner.

## Scheduling, RPO, RTO, and PITR

No scheduler is added. A conservative configurable starting proposal for the B2B Inquiry platform is every six hours, before every migration, prompt off-server replication, 14 verified local pairs, and regular disposable restore exercises. The selected frequency determines the potential data-loss window; six-hour logical backups can still lose roughly six hours of committed data. RTO depends on archive size, transfer, database resources, verification, forward migration, and controlled cutover, so no fixed RTO or zero-data-loss claim is made.

WAL archiving and point-in-time recovery are not implemented. PITR is a later Production hardening option if measured volume and business recovery requirements justify its operational complexity.

## Staging commands and filesystem

Future host paths are `/opt/yolpol/staging/backups` and, separately, `/opt/yolpol/production/backups`. The Staging directory should be owned or ACL-accessible by the deployment/backup operator and container UID/GID 1001 with restrictive mode such as `700`; artifacts should normally be mode `600`. The operations containers mount only that directory, with verification/restore mounts read-only, plus the identity file only where required. They never mount the Docker socket, project tree, whole `/opt`, or unrelated secrets.

From `/opt/yolpol/staging`, use the repository-managed Compose file and host-only runtime env:

```sh
docker compose --env-file runtime.env --profile backup run --rm backup-create
docker compose --env-file runtime.env --profile backup run --rm backup-verify verify <backup-id>
docker compose --env-file runtime.env --profile backup run --rm backup-deep-verify deep-verify <backup-id>
docker compose --env-file runtime.env --profile backup run --rm backup-retention
docker compose --env-file runtime.env --profile restore run --rm \
  -e YOLPOL_RESTORE_CONFIRMATION=RESTORE_TO_EMPTY_DATABASE \
  restore restore <backup-id>
```

All five operation services are one-shot and profile-gated. Normal `docker compose up` is unchanged. Backup/retention use a writable narrow backup mount; verification/deep verification/restore use it read-only. Only create/restore have database-network access; checksum and archive verification have no network. Restore has no restart policy and receives only the separately supplied recovery-target URL.

## Validation evidence

Executed locally with synthetic credentials and no provider/network integration:

- `pnpm test:backup-restore`: PASS; naming/schema, credential-field exclusion, missing/corrupt/unsupported artifacts, path escape, restore confirmation, dry-run, strict pairing, symlink escape, deletion acknowledgement, keep count, and newest-pair protection.
- `pnpm test:backup-restore:disposable`: PASS against two distinct PostgreSQL 17.6 containers using tmpfs. The source alone received all committed migrations plus one synthetic marker. Encrypted create, manifest/SHA-256 verification, decrypt/archive listing, restore to the empty destination, migration-state check, critical-table check, and marker check passed.
- Negative disposable checks: checksum corruption, missing identity, wrong identity, and a second restore into the now non-empty destination all failed non-zero as required.
- Retention dry-run preserved the newest artifact. Focused tests also exercised actual deletion only inside a synthetic temporary directory.
- Image inspection: 24,490,797 bytes; UID/GID `1001:1001`; PostgreSQL client `17.6`; `age 1.2.1`; expected entrypoint present; `.env.local`, `.git`, and private identity absent; validation transcript contained neither the synthetic password nor private-key material.
- The disposable validation created no named or persistent Docker volume. Its two tmpfs containers and isolated network were removed; no existing Development or Staging container, database, or volume was addressed.
- Staging `docker compose config -q`: PASS with synthetic temporary env/secret files.

- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: PASS, 218 files and 2,217 tests.
- `pnpm test:integration`: PASS, 13 files and 185 tests against the existing guarded tmpfs PostgreSQL fixture; its container was removed by the harness without a named volume.
- `pnpm db:check`: PASS using `NODE_ENV=production` and a synthetic closed-port `DATABASE_URL`, so `.env.local` was not loaded and no database was contacted. The first sandboxed attempt hit the known managed-Windows `uv_os_get_passwd ... ENOMEM`; the identical elevated retry passed.
- Production build: PASS. The Docker `runtime` target executed `pnpm build` in the `.env*`-excluded build context and generated 113 static pages. The host command was intentionally not used because Next.js would read the real host `.env.local`.

## Protected state and explicit deferrals

The existing `yolpol-staging_postgres_data`, `yolpol-staging_caddy_data`, and `yolpol-staging_caddy_config` volumes were not mounted, restored, or deleted. Development persistence, real Staging/Production data, real credentials, server access, DNS/Cloudflare/TLS, GitHub settings/secrets, CI workflows, deployment automation, monitoring, rollback/cutover automation, off-server upload, scheduling, and WAL/PITR remain untouched. No database migration was added. The preserved stash was not inspected or modified.
