# YOLPOL Release and Rollback Operations

This repository defines release artifacts; it does not deploy them. A release is one exact `main` commit, five first-party Linux/amd64 images, and a validated version-1 manifest plus SHA-256 checksum. Staging and Production promotion select the same immutable image digests. Neither promotion nor rollback rebuilds source.

## Version and source policy

`package.json` is the only human release-version source. Release tags are strict `vMAJOR.MINOR.PATCH` and must equal `v${package.json.version}`. During the pre-1.0 phase:

- PATCH is a compatible bugfix or operational fix.
- MINOR is a new compatible product or platform capability.
- MAJOR is reserved for an intentional major compatibility/version boundary.

Stable tags must point to a commit contained in `main`. The release workflow runs only for tag pushes matching `v*.*.*`, then applies the strict validator; normal pushes and pull requests remain CI-only. It fetches `main`, verifies ancestry, runs the release validation suite, and never merges branches or deploys.

## First-party images

The owner segment is normalized to lowercase. The release inventory is:

| Role | Docker target | GHCR repository |
| --- | --- | --- |
| Web | `runtime` | `ghcr.io/<owner>/yolpol-web` |
| Shared workers | `worker-runtime` | `ghcr.io/<owner>/yolpol-worker` |
| Explicit migrations | `migration-runtime` | `ghcr.io/<owner>/yolpol-migration` |
| Backup/restore operations | `operations-runtime` | `ghcr.io/<owner>/yolpol-backup-restore` |
| Operations Metrics exporter | `monitoring-runtime` | `ghcr.io/<owner>/yolpol-operations-metrics` |

`operations-test` is local validation only. Caddy, PostgreSQL, Prometheus, Alertmanager, Node Exporter, cAdvisor, PostgreSQL Exporter, and Blackbox Exporter remain upstream digest-pinned dependencies and are not republished.

The initial release platform is `linux/amd64`. Every build receives safe OCI source, full Git revision, and package version labels. Runtime secrets are not build arguments. The pinned base images, frozen pnpm lockfile, Next.js standalone artifact, non-root runtime users, and `.dockerignore` secret exclusions remain authoritative.

## Identity, aliases, and safe reruns

Publication first creates or reuses `sha-<full-git-sha>`. An existing SHA identity is pulled read-only and must report Linux/amd64 plus matching revision/version OCI labels. The workflow captures the registry manifest digest before considering the SemVer alias.

`v0.1.0` is an operator-readable alias. If it exists, it must resolve to the intended digest or publication fails. If absent, it is created from the already-published digest and verified. Release-specific concurrency does not cancel an in-progress run, preventing two runs for one tag from racing. A rerun can therefore reuse completed SHA images, complete missing aliases, regenerate identical assets, and complete a missing GitHub Release. Existing release assets are byte-compared and never silently replaced.

GHCR tags can be mutable at registry level. YOLPOL never treats a tag as the trust anchor and never publishes or deploys `latest`. The authoritative identity is:

```text
ghcr.io/<owner>/<package>@sha256:<digest>
```

The workflow uses GitHub's built-in `GITHUB_TOKEN` with job-scoped `packages: write`; the final release job alone receives `contents: write`. No custom GitHub Secret or PAT is required. Package visibility is managed separately. Private packages require future server read-only registry authentication; public packages can be pulled anonymously. That decision and any server pull credential belong to Production Deployment.

## Release manifest contract

`tooling/release/release-manifest.schema.json` documents schema version 1, while `tooling/release/release-contract.ts` is the strict repository-owned validator. Every manifest includes the version/tag/full SHA/source repository, `linux/amd64`, database fingerprint, and all five image records with role, Docker target, SHA tag, SemVer alias, digest, and immutable reference.

Generated instances are not committed. The workflow attaches these assets to the GitHub Release:

```text
release-manifest.json
release-manifest.sha256
```

The validator rejects unsupported versions, non-strict SemVer, tag/version mismatch, non-full or malformed Git SHAs, missing/duplicate/unexpected image roles, role/target mismatch, malformed digests, tag-based immutable refs, repository/ref mismatch, malformed migration metadata, `latest`, and all unexpected fields. The closed schema prevents credential or business-data fields from entering the artifact.

The migration fingerprint is SHA-256 over deterministic path-and-byte-length framing of LF-normalized `drizzle/meta/_journal.json` followed by every journaled root `drizzle/*.sql` file in exact journal order. Generation rejects a journal/SQL set mismatch. Drizzle snapshots are authoring metadata and are excluded because the runtime migrator consumes the journal and SQL set. Filesystem timestamps are never included.

Useful non-publishing commands are:

```sh
pnpm release:validate-tag --tag v0.1.0
pnpm release:migration-fingerprint
pnpm release:manifest:validate --manifest release-manifest.json
pnpm release:manifest:verify --manifest release-manifest.json --checksum release-manifest.sha256
pnpm release:rollback:plan --current current.json --target previous.json
```

Manifest generation additionally takes `--git-sha`, `--repository`, `--images-dir`, and a new `--output` path. Each images-directory JSON file has only `role`, `repository`, and registry-obtained `digest`; the generator derives and validates all other identity fields.

## Promotion and migration gate

Promotion follows `BUILD ONCE -> IDENTIFY BY DIGEST -> TEST IN STAGING -> PROMOTE SAME DIGEST -> PRODUCTION`. Copy the five immutable references and full Git SHA from one checksum-verified manifest into the environment's host-only runtime settings. Use Compose with `--no-build`. Production must never rebuild source or substitute a same-named tag.

When a release includes migrations, preserve this explicit gate:

```text
verified release manifest and checksum
-> current liveness/readiness verified
-> encrypted database backup
-> backup integrity verification
-> deep archive verification
-> off-server copy verification and durability confirmation
-> explicit migration job
-> immutable application release deployment
-> readiness and monitoring verification
```

No web or worker startup runs migrations, and the release workflow never accesses a database.

## Rollback runbook

1. Identify the checksum-verified manifest for the active release.
2. Select a checksum-verified manifest for an older known-good release. An old tag alone is insufficient.
3. Run `pnpm release:rollback:plan --current <active> --target <previous>`.
4. If the result is `APPLICATION_ONLY_ROLLBACK_PERMITTED`, the migration-set fingerprints are identical. Put the target manifest's immutable refs into the host-only settings, redeploy application services with `--no-build`, do not run migrations, then verify liveness, readiness, all workers, and monitoring.
5. If the result is `MANUAL_DATABASE_REVIEW_REQUIRED`, stop automation. Determine whether the previous application is compatible with the current schema. Never run an automatic down migration and never restore merely because image rollback was requested.
6. If compatibility requires database recovery, use a validated pre-migration encrypted backup, restore it into a separate database, validate it, and perform only an explicitly reviewed controlled cutover using the backup/restore runbook.
7. Record the resulting active release and retain both manifests.

The planner only validates JSON and emits a plan. It never invokes Docker, PostgreSQL, Drizzle, backup restore, or network operations.

## First Production release procedure (do not run from this feature)

1. Merge all completed features to `develop`.
2. Open a `develop` to `main` pull request.
3. Require the existing Quality, Disposable PostgreSQL integration tests, and Production build checks to pass.
4. Merge the reviewed pull request to `main`.
5. Confirm `main` is clean and release-ready.
6. Confirm `package.json` contains the desired version.
7. After explicit operator approval, create an annotated (signed when the operator's established signing setup is available) `vMAJOR.MINOR.PATCH` tag on that `main` commit.
8. Push the tag.
9. Confirm the release workflow validates the source and publishes all five SHA identities and safe SemVer aliases.
10. Download and independently verify `release-manifest.json` and `release-manifest.sha256` from the GitHub Release.
11. Populate Staging with the manifest's exact Git SHA and image digests; run Compose with `--no-build`.
12. Complete Staging acceptance testing.
13. Before any migration, complete the encrypted backup, integrity, deep archive, off-server verification, and durability gate.
14. Promote the same manifest and digests to Production without rebuilding.
15. Verify liveness, readiness, workers, and monitoring.
16. Retain the previous known-good manifest/checksum for rollback.

## Known limitations

The foundation does not deploy a server, configure registry pull access, change package visibility, sign images/manifests, manage Cosign keys, create a Production Compose project, infer schema backward compatibility, provide down migrations, perform database cutover, or implement PITR. GitHub tags and releases provide history; digest identity plus the checksum-verified manifest provides artifact selection. Supply-chain signing and expanded platform support can be added later without weakening this contract.
