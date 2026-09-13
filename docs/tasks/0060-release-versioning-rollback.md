# Task 0060: Release Versioning and Rollback Foundation

## Status

Implemented as a repository-only publication and planning foundation. No tag, image, GitHub Release, deployment, server, credential, database, DNS, Cloudflare, TLS, persistent volume, or protected stash operation is part of this task.

## Decision

Use strict package-sourced SemVer and explicit tag-triggered publication from `main`. Publish the five actual first-party Docker runtime targets under full Git-SHA identities, add a SemVer alias only after resolving the digest, and make a checksum-verified version-1 release manifest the promotion and rollback source of truth. Tags remain human aliases; `repository@sha256:digest` is authoritative.

The implementation and complete operator contract are documented in `deploy/release/README.md`.

## Repository changes

- `.github/workflows/release.yml` validates the tag/package/main ancestry and existing release checks, publishes/reuses five Linux/amd64 SHA identities with minimum job permissions, prevents conflicting SemVer aliases, generates/checksums/validates a manifest, and safely creates or completes a GitHub Release. It never deploys.
- `tooling/release` owns strict version, migration fingerprint, manifest, checksum, and pure rollback planning behavior plus focused tests and the JSON schema.
- The Dockerfile accepts safe OCI source/revision/version build arguments without passing runtime secrets or adding unstable timestamps.
- Staging and Monitoring Compose keep local `build` behavior and safe `:local` image defaults while accepting explicit manifest-derived `YOLPOL_*_IMAGE` digest refs for future `--no-build` deployment.
- `package.json` exposes cohesive local validation/generation/planning commands. The application version remains `0.1.0`; no application or Drizzle migration changes are made.

## Safety model

- A stable tag must be strict `vMAJOR.MINOR.PATCH`, equal `v${package.json.version}`, and point to a commit contained in fetched `main`.
- The workflow uses the built-in `GITHUB_TOKEN`; no custom secret or PAT is introduced. Image jobs receive `packages: write`; only GitHub Release creation receives `contents: write`.
- Existing SHA images must match Linux/amd64 plus the release revision/version labels. Existing SemVer aliases must resolve to the intended digest. Existing GitHub Release assets must be byte-identical. Conflicts fail closed.
- The manifest requires every deployable first-party role and rejects `latest`, tags as immutable refs, malformed or incomplete data, and unknown fields.
- Identical migration fingerprints allow only a conservative application-image rollback plan. Different fingerprints require manual database compatibility review. Automatic down migration and automatic restore are prohibited.
- Pre-migration backup, integrity/deep verification, off-server durability, explicit migration, and post-deploy readiness/monitoring remain separate operator gates.

## Validation contract

Focused validation covers SemVer/tag matching, full SHA and digest syntax, deterministic/change-sensitive migration fingerprints, strict manifest shape, required/unique image roles, digest-only refs, secret-field exclusion, checksum verification/corruption, and both rollback outcomes. Repository validation remains `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm db:check`, and `pnpm build`. Docker validation builds and inspects `runtime`, `worker-runtime`, `migration-runtime`, `operations-runtime`, and `monitoring-runtime` locally without pushing and renders Staging/Monitoring Compose with synthetic digest refs.

## Deferred work

Production Deployment will provision the real host, select GHCR visibility and read credentials, install checksum-verified manifest references into host-only settings, activate Staging, configure DNS/TLS, run acceptance and pre-migration backup gates, and promote the same digests to Production. Image/manifest signing, additional architectures, automatic schema compatibility inference, down migrations, PITR, and database cutover automation remain deferred.
