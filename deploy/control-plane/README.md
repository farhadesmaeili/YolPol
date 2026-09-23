# YOLPOL authenticated deployment control plane

This directory is the repository contract for Task 0066 Phase C1. Routine deployment has no inbound listener and no SSH path. A GitHub-hosted Environment job authenticates a published Release, creates a five-minute deployment intent, binds a GitHub OIDC token to the SHA-256 of the exact intent bytes, and creates an explicit GitHub Deployment. A dedicated host agent discovers that object using a repository-scoped GitHub App installation token and sends it to the root controller through one fixed sudo entry point.

## Trust and credential boundaries

The GitHub App must be installed only on `farhadesmaeili/YolPol` with `Deployments: read` and inherent metadata read. It has no mutation permission and is not a PAT. Each installation-token request additionally names only the verified numeric YolPol repository ID and requests only `deployments: read`; the agent rejects broader returned permissions or repository scope. `/etc/yolpol/control-plane/github-app-private.pem` is provisioned later by root as `root:yolpol-deployment-agent` mode `0440`; the repository never creates or contains it.

The Staging and Production capability keys are separate RSA private keys at the fixed paths in `agent.json.example`. They are root-owned mode `0400`, are provisioned later, and are unrelated to the GitHub App key. Their corresponding RSA public keys are base64-encoded GitHub Environment variables named `YOLPOL_DEPLOYMENT_CAPABILITY_PUBLIC_KEY_B64`; `YOLPOL_DEPLOYMENT_CAPABILITY_KEY_ID` identifies the selected key. A 4096-bit RSA key is required so RSA-OAEP-SHA256 can carry the bounded short-lived job token.

The encrypted job `GITHUB_TOKEN` is decrypted only by the root controller. It may authenticate Release assets, a request-local GHCR login, and Deployment status writes. The controller requires the signed OIDC `actor` and stable decimal `actor_id`; the validated `actor` is the GHCR username and the token is supplied only on standard input. Plaintext is not persisted. Private registry configuration lives below `/run/yolpol-deployment`, is removed on success or failure, and never changes `/root/.docker/config.json`. If authenticated login fails, immutable public images may be pulled with an empty request-local configuration.

`agent.json` is activation-time configuration. Replace every placeholder with verified repository/App/environment facts. The repository ID, owner ID, exact OIDC subjects, workflow refs, event/ref rules, App IDs, and capability key IDs are mandatory and fail closed. The example file is not an active configuration.

## Protocol and replay

Protocol version 1 uses compact, fixed-order UTF-8 JSON without a BOM or trailing whitespace. Decimal strings preserve GitHub numeric IDs. The body contains neither the OIDC JWT nor the Deployment ID. Its exact bytes are transported as unpadded base64url and its audience is exactly `yolpol-release-v1:<lowercase-sha256>`. The envelope has only `intentBody` and `oidcJwt`.

The controller validates GitHub discovery/JWKS, RS256 signature, JOSE headers, exact audience, repository and owner identities, Environment subject, caller and reusable workflow identities/SHAs, event/ref, run identity, signed `actor`/`actor_id`, GitHub-hosted runner, times, and `jti`. JOSE `x5t` is optional; when present it must be the canonical unpadded base64url SHA-1 thumbprint of the first JWKS `x5c` DER certificate. Unknown or critical headers and malformed or mismatched thumbprints fail closed. The controller independently fetches and validates the exact Deployment, then authenticates the Release/tag/two assets and immutable manifest.

`/opt/yolpol/runtime/deployment-ledger.json` is the durable root-only replay and outcome ledger. It binds Deployment ID, intent digest, `jti`, nonce, workflow run/attempt, environment, tag, Git SHA, and manifest digest, plus migration and status-sync state. Exact terminal retries synchronize the existing result; conflicts fail. An already-successful logical `environment + manifestSha256` target is not deployed twice. Any `started`/`failed` migration or explicit database-review result creates an environment-wide `MANUAL_DATABASE_REVIEW_REQUIRED` barrier across every later manifest. Any stale in-progress transaction, rollback failure, or explicit reconciliation result creates an environment-wide `MANUAL_DEPLOYMENT_RECONCILIATION_REQUIRED` barrier. Blocked requests are durably recorded and publish a terminal error without starting a transaction. A completed target migration followed by application failure may retry that same target application path without rerunning or reversing the database migration; successful records do not block a different target.

Stale transactions still fail closed and are never reconciled by normal deployment processing or the polling agent. The exceptional command `yolpol-deploy reconcile-staging-pre-mutation <deployment-id>` is available only from a direct root incident-recovery session; `SUDO_USER` must be `root`, so neither `yolpol-operator` nor `yolpol-deployment-agent` can use it. It takes the existing global deployment lock and accepts one canonical positive decimal GitHub Deployment ID, not an environment or path. The selected ledger record must exist exactly once with `environment=staging`, `phase=accepted`, `localOutcome=in-progress`, `migrationState=never-started`, null target fingerprint, and null result. The validated active authority SHA-256 and migration fingerprint must still equal the record's previous authority and current fingerprint, `/opt/yolpol/runtime/deployment-journals/<deployment-id>` must not exist, and no other Staging database-review or deployment-reconciliation blocker may exist. Only then is that one record atomically changed to terminal local failure `PRE_MUTATION_CRASH_RECONCILED` in phase `reconciled-pre-mutation`; immutable identity and historical status-synchronization fields remain unchanged.

This path does not recover release-authenticated or later phases, any migration ambiguity, rollback failure, manual-review state, changed/missing authority, or any transaction with a journal. It never deletes a journal, edits multiple records, repairs authority, or claims GitHub Deployment-status repair. SSH/root remains exceptional incident recovery; the expired job capability and the read-only GitHub App are neither required nor broadened.

The controller-to-agent result contract is closed: exit `0` means handled, `65` means permanently rejected before mutation, and `75` means retryable or uncertain. The agent processes every entry on the current page, durably marks handled and terminally rejected IDs as seen, leaves retryable IDs unseen, and advances the candidate ETag only when no retryable entry remains. Permanent invalid requests therefore cannot poison the page or cause indefinite backoff, while transient failures retain the previous ETag for another attempt.

## Lock, transaction, and rollback

Every public mutation takes `/opt/yolpol/runtime/deployment.lock` once. The controller holds descriptor 9 for the whole transaction and calls only the root-only, non-sudo-exposed `yolpol-deploy-internal` closed grammar. Human wrapper actions use the same lock, so they cannot interleave with automation.

Each accepted transaction creates a root-owned, mode-`0700` version-2 journal at `/opt/yolpol/runtime/deployment-journals/<deployment-id>`. The journal root contains the authenticated incoming `release-manifest.json`, its authenticated `release-manifest.sha256`, and the rendered target runtime files. Its `previous/` directory contains only the validated active authority and runtime files captured for pre-migration rollback. Journal files are root-owned and mode `0600`; the version marker is written last after the rollback namespace is durable. Rollback reads only `previous/`. Legacy, incomplete, structurally unexpected, symlinked, or environment-mismatched journals fail closed before authority restoration.

For a changed Staging migration fingerprint, the controller requires local encrypted backup creation, exactly one completion record, integrity verification, and deep decrypt/archive verification before migration. It then atomically advances the manifest/runtime authority, pulls immutable images, deploys PostgreSQL, conditionally migrates, deploys web/workers, updates only `operations-exporter`, and runs internal, ingress, and fixed public HTTPS smoke checks.

Before a changed migration starts, failure restores the previous manifest/runtime and redeploys the previous application services. Once a changed migration starts, an older application is never deployed automatically; the ledger enters manual review. No down migration, automatic restore, or automatic database switch exists.

Production is dispatch-only and also requires an existing provisioned Production contract, an exact successful Staging ledger record, and an unchanged migration fingerprint before any mutation. A changed fingerprint fails with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`. A successful Phase C1 result is `deployed-not-publicly-activated`; it does not alter ingress, DNS, Cloudflare, monitoring, secrets, or public activation.

## Activation prerequisites

Bootstrap installs and validates the account, files, directories, units, and sudo rules, then performs `systemctl daemon-reload` only. It does not enable or start the timer. Before an operator may enable it, all of the following must be independently reviewed and provisioned:

- the repository-scoped read-only GitHub App and its installation;
- verified numeric repository/owner IDs and exact workflow/OIDC claims in `agent.json`;
- separate 4096-bit Staging and Production capability key pairs;
- GitHub `staging` and `production` Environments, approval policy, and the two required variables in each;
- existing valid host runtime, secret, release, ingress, backup, and database contracts for each environment being used;
- package visibility and `GITHUB_TOKEN` package-read behavior;
- a reviewed bootstrap-source promotion and successful bootstrap checks.
- replacement of mutable third-party Action version tags with independently verified full commit SHAs.

Only after that separate activation review may root run `systemctl enable --now yolpol-deployment-agent.timer`. Custom deployment-protection apps are incompatible with `environment.deployment: false`; normal Environment approval and variables remain supported.

Application secrets remain environment-separated on the host. Phase C1 has no routine application-secret transport. A later explicit Environment-gated sync/rotation workflow must own that concern; changing a GitHub Environment application secret alone cannot alter host runtime state.

## Known limitations

Phase C1 provides local encrypted pre-migration backup verification only. Production migration changes remain blocked until Phase C2 supplies independently verified off-server durability. Crash handling is deliberately fail-closed; only the narrowly proven, explicit root-only Staging pre-mutation reconciliation above can terminalize one stale record. Status synchronization still depends on the request's short-lived job capability, and reconciliation does not repair it. No automatic restore exists. Third-party workflow Actions still use mutable major-version tags and must be full-SHA pinned before activation after those exact SHAs are independently verified. This repository task neither configures GitHub settings/App credentials nor activates a VPS.
