# Task 0079 - Phase C2 changed-fingerprint live acceptance

## Status and boundary

Task 0079 prepares a repository release whose migration fingerprint genuinely differs from the currently deployed `0023_telegram_notification_destinations` migration set. It does not deploy Staging or Production, create or transfer a backup, publish canonical Phase C2 evidence, mutate a database, invoke a GitHub deployment, or change the activated VPS or Windows configuration.

The repository implementation is complete when migration `0024_phase_c2_live_acceptance` and its generated Drizzle metadata are validated, application readiness requires its generated journal timestamp, the release fingerprint changes naturally, and current documentation separates completed adapter acceptance from the still-pending deployment gate.

## Already-completed live infrastructure acceptance

The separately approved live activation completed outside this repository task:

- the final Task 0078 Windows durability helper is installed;
- the fixed Scheduled Task runs as LocalSystem on its accepted recurring cadence with no abnormal pending backlog;
- the VPS Phase C2 configuration is the canonical configured `windows-sftp-v1` form;
- the fixed SFTP private key, pinned Windows host key, pinned receipt public key, and Windows CNG RSA-3072 signing authority are installed and validated.

Those facts describe the accepted live infrastructure. The committed repository default remains fail-closed and unconfigured; Task 0079 does not copy live configuration or trust material into the repository.

## Adapter-level real backup acceptance

A real encrypted Production backup was locally integrity/deep verified and exercised through the installed `WindowsSftpDurabilityAdapter`. The `/production` and `/durable` pairs matched the VPS source sizes and SHA-256 values, the native durable-write and `FlushFileBuffers` path completed, and the canonical receipt's detached RSA-PSS/SHA-256 signature verified with the pinned VPS public key.

The accepted historical object set is:

- backup ID: `yolpol-production-20261005T181545Z-589aa940c3e34985d5603b72b9844d2072fde1ef`
- artifact: 177093 bytes, SHA-256 `36501eb7b8fabfa7583e22eb8226851decb061ac5d2e1f2ca05e0223b9731769`
- manifest: 895 bytes, SHA-256 `ac58f6d5ed410d89571d65b6d950c774e10ec15ac49f93f4c1136d25f08767e2`

This is immutable historical adapter-acceptance evidence. It must never be reused, overwritten, repaired, deleted, adopted, or rebound to a future deployment. Existing remote collision behavior remains fail-closed.

## Repository migration implementation

Installed `drizzle-kit` version `0.31.10` supports `generate --custom`. That repository-supported generator created the final journal entry, `drizzle/0024_phase_c2_live_acceptance.sql`, and `drizzle/meta/0024_snapshot.json`.

The migration contains exactly `SELECT 1;`. It is deterministic, valid PostgreSQL, safe inside the existing transactional Drizzle runner, and has no application-schema, application-data, extension, role, grant, configuration, function, trigger, secret, or external effect. Its only intended persistent effect is the normal Drizzle migration-journal advancement performed by the existing migrator.

The journal entry is:

- index: `24`
- tag: `0024_phase_c2_live_acceptance`
- timestamp: `1791230751683`

No migration at `0023` or earlier is modified. The generated `0024` snapshot represents the same application schema as `0023`; it advances only the snapshot identity chain.

## Migration-marker semantics

Application readiness advances to timestamp `1791230751683`. This release must remain unready until migration `0024` is present in `drizzle.__drizzle_migrations`.

The backup/restore, monitoring-manifest, disposable-restore, and Phase C2 adapter minimum marker deliberately remains `0023_telegram_notification_destinations` at timestamp `1789391490099`. The changed-fingerprint controller creates and verifies the Production backup before it applies target migration `0024`, and `0024` makes no business-schema change. Raising those compatibility floors would incorrectly reject the required pre-migration backup.

Historical task and deployment records retain the migration markers that were true when those records were written.

## Release fingerprint contract

The release fingerprint algorithm remains unchanged. It hashes normalized `drizzle/meta/_journal.json` followed by every journaled root `drizzle/*.sql` file in exact journal order. Drizzle snapshots remain authoring metadata and are excluded.

- pre-0024 fingerprint: `48bfbae76d5421516cfca1406c47e509e0e9c89edac3cda048c08aa15e190f24`
- post-0024 fingerprint: `606a82f9999d2cc7efbd572dbaac1fdd35e417c6ae5ac61ae8dd876bb62540d4`

The fingerprint transition comes only from the legitimate new journal entry and SQL migration. It does not modify historical migration bytes or weaken the fingerprint algorithm.

## Deployment-bound acceptance pending at Task 0079 completion

Adapter acceptance did not publish canonical deployment-bound Phase C2 evidence and did not advance a real deployment ledger to `offserver-durability-confirmed`.

The eventual Production acceptance must start from a real GitHub Production Deployment and authenticated target release. The controller must create a fresh Production backup with a new unique backup ID, verify it locally, transfer that new pair, validate the LocalSystem durable copy and signed receipt, independently read back the exact `/durable` pair, publish evidence bound to the real Deployment ID and current/target fingerprints, and only then advance the ledger and continue the migration/deployment.

There is no standalone evidence fabrication, adoption, rebinding, caller-selected deployment identity, existing-backup reuse, collision recovery, remote cleanup, or ledger-edit path. Until that complete changed-fingerprint transaction succeeds, `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` remains the correct fail-closed outcome for an unsuccessful or incomplete attempt.

## Subsequent v0.2.7 live acceptance

After Task 0079 was merged and released, `v0.2.7` was published and Staging accepted the exact release. Production promotion was then explicitly approved through the authenticated controller path.

The controller created fresh backup `yolpol-production-20261006T001534Z-589aa940c3e34985d5603b72b9844d2072fde1ef`. Canonical evidence was published and validated against Production Deployment `6872397689`, release manifest SHA-256 `1877cebad8109255005edd46b0adb348d7b5458eb22b864cb8aee690313b2d87`, and the exact fingerprint transition from `48bfbae76d5421516cfca1406c47e509e0e9c89edac3cda048c08aa15e190f24` to `606a82f9999d2cc7efbd572dbaac1fdd35e417c6ae5ac61ae8dd876bb62540d4`.

The evidence confirmed local integrity, deep archive verification, authenticated Windows durable write, exact destination readback, and binding to the fresh object set. Only after that acceptance did migration `0024_phase_c2_live_acceptance` complete. The Production deployment then completed with synchronized status and final result `deployed-not-publicly-activated`.

This later acceptance closes the deployment gate that was still pending when Task 0079 itself completed. It does not permit reuse or rebinding of the earlier adapter-only backup, weaken the repository's unconfigured fail-closed default, or change the requirement that every future changed fingerprint provide its own fresh valid evidence.

## Disaster recovery remains separate

The accepted infrastructure and adapter transfer do not prove restore or disaster recovery. Disposable rebuild, recovery restore, validation, and any cutover exercise remain separately approved work. Task 0079 does not claim that Phase C2 as a whole or disaster-recovery acceptance is complete.

## Validation

No validation in this task targeted a live database or performed a live deployment/provider operation.

- `pnpm db:check`: PASS (`Everything's fine`); the exact command required an unrestricted retry after the managed Windows sandbox denied the user-profile lookup.
- `pnpm release:migration-fingerprint`: PASS; reported `0024_phase_c2_live_acceptance` and `606a82f9999d2cc7efbd572dbaac1fdd35e417c6ae5ac61ae8dd876bb62540d4` after the same environment-only unrestricted retry.
- `pnpm exec vitest run tooling/release/phase-c2-live-acceptance-migration.test.ts`: PASS, 4/4 tests.
- `pnpm test:release`: PASS, 4 files and 36/36 tests.
- focused PostgreSQL readiness test: PASS, 5/5 tests.
- `pnpm test:monitoring`: PASS, 2 files and 14/14 tests.
- `pnpm test:control-plane`: PASS, 119 Python tests plus 20/20 Vitest tests; one optional Windows symlink case skipped because it requires additional privileges.
- `pnpm test:backup-restore`: PASS in the fixed operations-test container.
- `pnpm test:backup-restore:disposable`: PASS against three isolated PostgreSQL 17.6 containers using `tmpfs`; all committed migrations applied, encrypted create/verify/deep-verify/restore and negative guards passed, and zero persistent validation volumes were created.
- `pnpm lint`: PASS with no warnings.
- `pnpm typecheck`: PASS.
- `pnpm test`: the unrestricted full run passed 2,514/2,515 tests across 250/251 files. The sole failure was the pre-existing Docker Compose validation test exceeding its 30-second timeout under full-suite concurrency; that file and the other two environment-dependent files passed together in isolation, 20/20 tests. No test was weakened or timeout changed.
- `pnpm build`: PASS with Next.js 16.3.0; 81 static pages generated.
