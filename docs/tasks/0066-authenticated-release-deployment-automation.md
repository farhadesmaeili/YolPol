# Task 0066: Authenticated Release Deployment Automation

## Status

Phase C1 is implemented as a repository-owned, locally validated contract. It has not been activated on a VPS. No GitHub App, GitHub Environment, key material, Production host, DNS, Cloudflare, database, provider, commit, or push was changed by this task.

## Architecture

The fixed path is:

```text
GitHub-hosted approved Environment job
-> authenticated published Release and exact assets
-> canonical five-minute intent bytes and SHA-256
-> exact-audience GitHub OIDC token
-> explicit GitHub Deployment
-> outbound read-only GitHub App poller
-> root OIDC/Deployment/Release verifier and ledger
-> one-lock internal deployment transaction
```

Routine SSH, inbound webhooks, self-hosted runners, PATs, arbitrary commands, paths, images, services, or repositories are absent. SSH remains an exceptional bootstrap/recovery/incident/debugging tool.

## Security boundaries

The Environment job's permissions are explicit and job-local. Release validation uses `contents: read`; image publication uses `contents: read` plus `packages: write`; Release publication uses `contents: write`; approved deployment uses `contents: read`, `packages: read`, `deployments: write`, and `id-token: write`. Top-level workflow permissions are empty.

The polling agent is the non-login UID/GID `1002:1002`, has no supplementary or Docker group, and can sudo only the two exact argument-free public intent actions. It authenticates polling with a short-lived installation token from a GitHub App installed only for the fixed repository with `Deployments: read`. Every token request is also narrowed to the verified numeric YolPol repository ID and `deployments: read`, and broader returned permission/repository contracts fail closed. The App token is never used for mutation. ETags, a 15-second normal interval, bounded backoff, `Retry-After`, and rate-limit reset handling prevent unauthenticated or busy polling. The controller returns only handled (`0`), terminal rejection (`65`), or retryable/uncertain (`75`). The agent processes the complete page, durably marks handled and terminally rejected IDs as seen, leaves retryable IDs unseen, and advances the response ETag only when no retryable entry remains. A permanent invalid request therefore cannot poison later valid entries or create indefinite backoff. The systemd unit does not set `NoNewPrivileges` or an empty capability bounding set because its reviewed purpose is to enter the exact sudo controller; its inherited mount namespace exposes writes only for the controller's required `/opt/yolpol`, `/run`, and agent-state paths.

The root controller separately validates the Deployment with the same App identity. A separately encrypted short-lived job token is limited to Release/asset reads, request-local GHCR login, and Deployment status publication. The signed OIDC `actor` and stable decimal `actor_id` are both mandatory; only the validated actor is used as the GHCR username, with the token passed through standard input. App private keys, capability private keys, plaintext tokens, and application secrets never enter the ledger.

## Intent, OIDC, and Deployment contracts

The strict version-1 intent is fixed-order compact UTF-8 JSON. It carries repository/owner identity, environment, Release tag, full commit, manifest digest, run identity, caller/reusable workflow identity, event/ref, bounded timestamps, nonce, and RSA-OAEP-SHA256 capability. The body excludes both JWT and Deployment ID. Duplicate/unknown keys, non-canonical base64url, BOM/whitespace/trailing bytes, unsafe types, and oversized input fail closed.

The audience is exact equality with `yolpol-release-v1:` plus the lowercase SHA-256 of the transported intent bytes. Verification accepts only a known GitHub JWKS RS256 key, `typ=JWT`, no critical extension, exact issuer/claims, a string audience, a GitHub-hosted runner, and bounded `iat`/`nbf`/`exp`. Optional JOSE `x5t` is accepted only as the canonical unpadded base64url SHA-1 thumbprint of the first JWKS `x5c` DER certificate; unknown headers and malformed or mismatched thumbprints fail closed. The Deployment must use the full intended SHA, fixed task/description/environment flags, exact two-key payload, Actions bot creator, bounded creation time, and repository-owned statuses URL.

## Ledger, lock, backup, and rollback

The fsynced root-only ledger records replay identities, prior authority, migration fingerprints/state, transaction phase, local result, GitHub status-sync state, and timestamps. It rejects Deployment remapping and digest/`jti`/nonce reuse and deduplicates an exact successful manifest. Any `started`/`failed` migration or explicit database-review result durably blocks every later manifest in that environment with `MANUAL_DATABASE_REVIEW_REQUIRED` before transaction mutation. Any stale in-progress transaction, rollback failure, or explicit reconciliation result likewise blocks every later manifest in that environment with `MANUAL_DEPLOYMENT_RECONCILIATION_REQUIRED`. Blocked attempts are themselves durable terminal records and publish an error status. A completed target migration followed by application/readiness failure remains eligible to retry only that target application path without rerunning or reversing the migration; a successful record does not block a different target.

The public wrapper obtains the single existing global lock once. Root-only internal primitives accept only fixed action names and require the inherited lock descriptor for mutations; they are not in sudoers and never call the public wrapper recursively.

A changed Staging fingerprint requires the composite encrypted backup gate: capacity/throttle check, create, exactly one strict internal backup ID, integrity verify, deep decrypt plus archive-list verify, then throttle success. Failure prevents migration. Only bounded nonsecret JSON leaves the gate; detailed output remains in the root operation log.

Before changed migration starts, the previous manifest/runtime and application services can be restored. From migration start onward, old application rollback is prohibited and failures require target-compatible repair/manual review. Same-fingerprint failures restore and redeploy the previous authority. Automatic down migration, restore, database switch, and data deletion are absent.

## Staging lifecycle

Successful Release publication calls the reusable `staging` Environment job. The host validates current Staging and Monitoring, applies the backup gate when required, atomically advances authority/runtime, pulls only approved digests, deploys PostgreSQL, migrates only on fingerprint change, deploys web/workers and exactly the Monitoring `operations-exporter`, then checks service health, shared-ingress reachability, HTTPS liveness/readiness, `/en`, and the Staging no-index header. Staff provisioning, Telegram registration, broad Monitoring changes, and infrastructure cutover are excluded.

## Production Phase C1 boundary

Production has only an explicit `workflow_dispatch` path through the `production` Environment. Before mutation, the controller requires a provisioned independent Production authority/runtime/secrets/database contract, a successful Staging ledger record for the exact manifest, and a migration fingerprint equal to current Production. A changed fingerprint fails with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`.

Phase C1 never creates the first Production database, installs first Production application secrets, changes shared ingress, activates Production monitoring, changes DNS/Cloudflare, or claims the site is public. Its success result is `deployed-not-publicly-activated`. Phase C2 must add verified off-server backup durability before Production migration automation is eligible.

## Bootstrap and activation

Task 0065 now installs and validates the agent account, root-owned control-plane files, systemd service/timer, two sudoers contracts, control-plane/state/journal paths, and optional credential metadata. It never creates or retrieves key material and never enables or starts the agent timer. `deploy/control-plane/README.md` is the activation and configuration contract.

GitHub Environments must later provide only the independent capability public key and key ID variables for this routine path. Application secrets remain in separate host contracts and require a later explicit Environment-gated sync/rotation design. `environment.deployment: false` prevents GitHub from creating an implicit Deployment before OIDC binding; it is incompatible with custom deployment-protection apps.

## Operational limitations

Activation settings and credentials require a separate reviewed operation. The transaction has a fixed 75-minute deadline, but a process/host crash is not auto-resumed; stale in-progress ledger records fail closed. Deployment-status retries depend on the still-valid encrypted job capability. Third-party workflow Actions still use mutable major-version tags; full commit-SHA pinning remains a required before-activation supply-chain hardening item after the exact SHAs are independently verified. There is no image/manifest signature layer, automatic database recovery, off-server durability proof, Production public cutover, or disaster-recovery proof in Phase C1.
