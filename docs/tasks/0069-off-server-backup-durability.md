# Task 0069: Off-server Backup Durability

## Status and activation boundary

The repository-side Phase C2 foundation is implemented and locally testable. It is not activated on the live VPS. No real remote storage provider, bucket, account, hostname, credential, Production backup upload, Production migration, database operation, DNS/Cloudflare change, or Production Monitoring change is part of this task.

The installed example state is deliberately `unconfigured`. Until a separately reviewed provider adapter and root-owned configuration are implemented, installed, and validated, a changed Production migration fingerprint still ends with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` before Production authority or runtime mutation.

## Objective

Permit a future Production-changing release only after the root controller proves that the fresh encrypted backup created for that exact deployment was integrity-verified, deep-verified, copied off the application server, independently verified at the destination, durably written, and bound by strict non-secret evidence to the exact backup, migration transition, target Release manifest, and GitHub Deployment.

Same-fingerprint Production releases remain on the existing Phase C1 path and do not require Phase C2.

## Threat model

The contract fails closed against:

- local disk loss being mistaken for disaster recovery;
- a local-only, integrity-only, or deep-verify-only backup being accepted as remotely durable;
- partial, truncated, altered, missing, or wrong destination objects;
- a provider operation that copied bytes but did not independently re-read them;
- a destination acknowledgement without a bounded durable-write confirmation;
- caller-selected paths, executables, shells, URLs, providers, buckets, accounts, or commands;
- stale or replayed evidence from another backup, deployment, Release, or migration transition;
- duplicate/unknown JSON fields, malformed or oversized input, unsafe identifiers, path escape, and symlinks;
- credentials, raw provider responses, database URLs, customer data, or other sensitive values entering evidence, the deployment ledger, GitHub status, or logs;
- authority activation or Production migration before durability succeeds;
- automatic application rollback being represented as database rollback after a changed migration starts.

Root-owned source code and fixed host configuration remain trusted. A future concrete adapter must itself be reviewed to ensure that its normalized destination verification and durability confirmation accurately represent the selected storage system.

## Trust boundary and provider-neutral architecture

`deploy/operations/yolpol-offserver-durability.py` is installed root-owned as `/opt/yolpol/bin/yolpol-offserver-durability`. The release controller imports that fixed module directly. It does not execute a caller-selected command and accepts no destination/provider configuration from the deployment intent.

The core exposes a narrow `RemoteDurabilityAdapter` protocol. An adapter receives exactly one already-validated encrypted backup pair and must return one normalized `RemoteDurabilityConfirmation`. The core revalidates that confirmation, creates canonical evidence, publishes it atomically, fsyncs it, reads it back, and validates it again. The repository contains no real adapter and no cloud SDK. The synthetic adapter exists only in the disposable test harness and uses temporary directories.

The fixed live configuration path is `/etc/yolpol/offserver-durability.json`, root-owned mode `0600`. The repository-managed example contains only:

```json
{"schemaVersion":1,"state":"unconfigured"}
```

That state cannot authorize durability. A real provider requires a later reviewed source change and activation operation; changing a boolean or supplying a receipt cannot bypass the gate.

## Phase C1 limitation and Phase C2 sequence

Phase C1 already authenticated Releases and supported same-fingerprint Production promotion, but it deliberately stopped changed Production fingerprints before mutation. Phase C2 changes the repository transaction sequence to:

```text
authenticate exact Release and target manifest
-> validate current Production contract
-> require exact successful Staging ledger record
-> compare current and target migration fingerprints
-> create a fresh encrypted Production backup
-> verify the local pair
-> deep-verify the encrypted archive
-> copy the exact encrypted pair through the fixed adapter
-> independently re-read and checksum the destination pair
-> confirm a durable destination write
-> create, fsync, read back, and strictly validate bound evidence
-> snapshot previous runtime and create the deployment journal
-> activate target authority and runtime
-> pull exact images and deploy Production PostgreSQL
-> run the fixed `migrate-production` primitive
-> deploy and verify application/workers
```

The existing 900-second backup throttle remains authoritative. It is not bypassed for Phase C2. A throttled transaction fails before authority mutation and must be retried only after the deterministic throttle window; an older arbitrary backup is never substituted.

## Backup identity and remote copy unit

The backup ID must be a strict Production identifier generated by the fixed backup primitive. The controller accepts only the exact bounded receipt emitted after create, integrity verification, and deep verification. Its schema version must be the JSON integer `1`, and both verification fields must be the JSON boolean `true`; boolean/integer type confusion, duplicate/unknown fields, and non-canonical bytes fail closed.

The remote unit is exactly:

- `<backup-id>.dump.age` — the encrypted PostgreSQL custom archive;
- `<backup-id>.manifest.json` — the adjacent manifest.

The Phase C2 core re-reads the local manifest, requires Production identity and exact pairing, verifies artifact size and SHA-256, and rejects non-regular files, symlinks, and path escape before invoking an adapter. Plaintext dumps and the private age recovery identity never enter the remote adapter.

## Remote durability evidence

Evidence is canonical, sorted, compact JSON with a trailing newline. The schema version must be the JSON integer `1`, while all verification fields must be the JSON boolean `true`; numeric and string lookalikes fail closed. Duplicate keys, unknown keys, BOMs, malformed JSON, non-finite values, non-canonical serialization, unsafe identifiers, wrong types, stale/future timestamps, and oversized content also fail closed. Each deployment gets one non-reusable file:

`/opt/yolpol/runtime/offserver-durability-evidence/deployment-<deployment-id>.json`

The directory is `root:root 0700`; evidence files are `root:root 0600`. Existing paths, including symlinks, are never overwritten.

Schema version 1 contains only:

| Field | Binding |
| --- | --- |
| `schemaVersion` | exact value `1` |
| `environment` | exact value `production` |
| `deploymentId` | exact positive decimal GitHub Deployment ID |
| `backupId` | exact fresh Production backup |
| `artifactFilename` / `artifactSha256` | encrypted artifact identity and checksum |
| `manifestFilename` / `manifestSha256` | adjacent manifest identity and raw-byte checksum |
| `currentMigrationFingerprint` | exact validated active migration transition source |
| `targetMigrationFingerprint` | exact authenticated target transition destination |
| `targetManifestSha256` | exact authenticated Release manifest |
| `localIntegrityVerified` | exact `true` |
| `deepArchiveVerified` | exact `true` |
| `destinationVerified` | exact `true` |
| `verificationSource` | exact `destination`, never the local source |
| `durableWriteConfirmed` | exact `true` |
| `durabilityConfirmation` | bounded normalized non-secret confirmation class |
| `remoteObjectSetId` | bounded provider-neutral object-set identity, not a credential-bearing URL |
| `verifiedAtUnix` | bounded fresh verification time |

Evidence excludes database URLs, passwords, access keys, provider tokens, private age identity, customer/inquiry data, pricing, raw provider output, arbitrary URLs, paths, commands, and shell content.

## Controller and ledger integration

For a changed Production fingerprint, the ledger first records the exact `phaseC2BackupId` after the fixed backup receipt is validated. Only successfully validated durability evidence advances the phase to `offserver-durability-confirmed`. The ledger retains only the bounded backup ID, artifact SHA-256, manifest SHA-256, remote object-set identity, and verification timestamp; it does not store the evidence body or provider response.

If the adapter/configuration is unavailable or any copy, verification, confirmation, or evidence check fails, the record moves to `phase-c2-required`, publishes only `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`, and creates no journal or authority mutation. A crash or stale in-progress attempt is not reusable by another deployment; the existing environment-wide reconciliation barrier remains authoritative.

The controller now permits the already-existing fixed `backup-create-verify-deep-production` and `migrate-production` internal actions. It never invokes `migrate-staging` for Production and does not broaden the public sudo or arbitrary command surface.

## Rollback and failure behavior

Before migration begins, an ordinary post-activation failure may restore the previous authority/runtime and redeploy the previous application. Phase C2 failure itself occurs before journal creation and authority activation, so it performs no rollback mutation.

Once a changed Production migration starts, completes, or fails, later failure requires manual database review. A failure while migration is started persists `migrationState=failed`; a later failure after migration completes persists phase `manual-review` while preserving `migrationState=completed`. Either state blocks every distinct subsequent Production deployment with `MANUAL_DATABASE_REVIEW_REQUIRED`. The controller does not run a down migration, automatically restore a backup, switch databases, delete data, or claim that application rollback restores database state. Backup availability is recovery evidence, not authorization for automatic restore. Staging retains its established completed-migration forward-retry behavior.

## Retention implications

Evidence creates a strict future predicate for Production destructive retention: a backup can be considered remotely durable only when its canonical evidence validates against the same backup pair. This task does not wire automatic deletion to that predicate and does not enable Production pruning. Existing retention remains dry-run by default and still requires explicit deletion mode and confirmation. Local existence, local verification, or a remote copy without validated evidence is insufficient.

## Synthetic test adapter and strategy

The test-only adapter uses three distinct temporary directories: source backup, destination storage, and root-style evidence. It copies the encrypted artifact and manifest, flushes and fsyncs both destination files, fsyncs the destination directory on supported platforms, then independently re-reads destination bytes, verifies both checksums, performs a synthetic fsync-class durability confirmation, and returns only bounded normalized fields.

Adversarial tests cover upload failures, missing/truncated/altered destination objects, checksum mismatch, wrong backup identity, destination verification absence, accidental local-source verification, missing/malformed durability confirmation, stale evidence, provider failure, duplicate/unknown evidence fields, wrong environment/backup/fingerprints/Release/deployment, symlink/path escape, unavailable live configuration, controller failure before authority activation, correct Production migration selection, same-fingerprint compatibility, and manual review after migration.

All tests use synthetic bytes, temporary storage, and mocks. They access no Internet service, VPS, cloud account, real database, real backup, or real credential.

## Explicit deferrals

Deferred to separately reviewed operations or tasks:

- selection and implementation of a concrete remote storage provider;
- provider account, destination, hostname, credential, and root configuration;
- live VPS contract refresh and provider activation;
- a real encrypted Production backup upload or remote verification;
- enabling changed-fingerprint Production migration automation in live operation;
- automatic Production pruning;
- restore automation, database cutover, down migrations, PITR, and zero-data-loss claims;
- Production Monitoring activation and external durability monitoring;
- final public DNS/Cloudflare cutover;
- disposable full rebuild and disaster-recovery proof.

Repository implementation does not imply live activation. Until all provider and host activation work is separately completed and verified, the correct live outcome remains `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`.

## Repository validation

Validation used only repository tests, synthetic backup bytes, temporary directories, and disposable containers:

- `pnpm test:control-plane`: passed; 80 Python tests ran (79 passed and the Windows-only symlink case was skipped), and 20 Vitest assertions passed. The same symlink/path controls remain covered by the Linux CI test definition.
- `pnpm test:deployment`: passed; 6 files and 61 tests.
- `pnpm test:bootstrap`: passed; 1 file and 8 tests.
- `pnpm test:release`: passed; 3 files and 32 tests.
- `pnpm test:deployment:disposable`: passed; the isolated Linux wrapper/bootstrap harness ran 26 Python adversarial tests and the fixed command-grammar checks.
- `pnpm test:backup-restore`: passed.
- `pnpm test:backup-restore:disposable`: passed; all source/destination databases were temporary containers, no persistent validation volume was created, and cleanup passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.

The first sandboxed attempts at the Docker-backed commands could not read Docker Desktop's user configuration/Buildx directory. The identical approved elevated retries passed; no policy or test was weakened.
