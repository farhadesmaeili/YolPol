# Production Deployment Record: v0.2.7

## Deployment result

On 2026-10-06, YOLPOL release `v0.2.7` completed the authenticated Staging-to-Production path and the first real deployment-bound changed-migration-fingerprint Phase C2 transaction.

The final controller result was:

```text
result=deployed-not-publicly-activated
phase=completed
localOutcome=success
statusSynchronization=synced
failureStage=null
failureDisposition=null
```

This record proves a healthy Production runtime deployment. It does not claim final public DNS/Cloudflare cutover.

## Release and deployment identity

- Version: `0.2.7`
- Tag: `v0.2.7`
- Git SHA: `ebf1988e1b7e6fbc4615fd946652f8147e34af6f`
- Published release-manifest SHA-256: `1877cebad8109255005edd46b0adb348d7b5458eb22b864cb8aee690313b2d87`
- GitHub Production workflow run: `37391155127`
- GitHub Production Deployment ID: `6872397689`
- Previous authority SHA-256: `f02a15ba81ebc8e88602b07c3a6e1786b75c3a1ca60970a616066a0c4e60b803`

Staging accepted the exact published release before explicit Production approval. Production promoted the same authenticated release identity; it did not rebuild or substitute mutable image tags.

## Migration transition

```text
previous migration:
0023_telegram_notification_destinations

previous migration-set SHA-256:
48bfbae76d5421516cfca1406c47e509e0e9c89edac3cda048c08aa15e190f24

target migration:
0024_phase_c2_live_acceptance

target migration-set SHA-256:
606a82f9999d2cc7efbd572dbaac1fdd35e417c6ae5ac61ae8dd876bb62540d4
```

Migration `0024_phase_c2_live_acceptance` was generated through the repository migration path and contains exactly `SELECT 1;`. It changes no business schema. Application readiness requires `0024`, while the backup/restore compatibility floor deliberately remains `0023_telegram_notification_destinations` because the changed-fingerprint controller backup is created before migration.

The Production ledger reached accepted Phase C2 durability before migration began. Migration state then completed successfully.

## Fresh Phase C2 backup and object identity

- Backup ID: `yolpol-production-20261006T001534Z-589aa940c3e34985d5603b72b9844d2072fde1ef`
- Encrypted artifact SHA-256: `c0eb739078e7da1e68f0c9589a869f9c1cc8e6a3fc7ec2bf1f61d4a1c749e961`
- Backup manifest SHA-256: `a9b4a216bc5d7249c8900018868a8924a1b7e0ff061463b1d95380ca4ff30522`
- Remote object set: `windows-sftp-v1:/durable/yolpol-production-20261006T001534Z-589aa940c3e34985d5603b72b9844d2072fde1ef`

The authenticated controller created this backup specifically for Production Deployment `6872397689`. No earlier backup was adopted or rebound.

## Accepted Phase C2 evidence

The canonical evidence verified:

- local artifact/manifest integrity;
- deep archive verification;
- destination verification and exact durable-destination readback;
- Windows durable-write confirmation using `windows-flushfilebuffers-volume-v1`;
- RSA-PSS/SHA-256 authenticated receipt provenance with the fixed signing contract;
- binding to Production Deployment `6872397689`;
- binding to the exact target release-manifest SHA-256;
- binding to the exact previous and target migration fingerprints;
- migration only after Phase C2 durability acceptance.

The evidence reports `verificationSource=destination`, `localIntegrityVerified=true`, `deepArchiveVerified=true`, `destinationVerified=true`, and `durableWriteConfirmed=true`.

The repository's canonical default remains unconfigured and fail-closed. This successful transaction does not create an evidence-reuse path: every future changed fingerprint requires a fresh controller-created backup and exact valid evidence.

## Historical adapter-only object remains separate

The earlier immutable backup `yolpol-production-20261005T181545Z-589aa940c3e34985d5603b72b9844d2072fde1ef` remains adapter-level acceptance evidence only. It was not bound to a GitHub Deployment and was not reused, rebound, adopted, repaired, overwritten, or deleted during the `v0.2.7` transaction.

## Post-deployment state

The active Production manifest reports:

```text
version=0.2.7
tag=v0.2.7
gitSha=ebf1988e1b7e6fbc4615fd946652f8147e34af6f
database.latestMigration=0024_phase_c2_live_acceptance
database.migrationSetSha256=606a82f9999d2cc7efbd572dbaac1fdd35e417c6ae5ac61ae8dd876bb62540d4
manifestSha256=1877cebad8109255005edd46b0adb348d7b5458eb22b864cb8aee690313b2d87
```

Verified health and validation state:

- Production web: up and healthy
- Production PostgreSQL: up and healthy
- inquiry-notifications worker: up
- conversation-translation worker: up
- conversation-ai-fallback worker: up
- `production-validate`: passed
- `production-health`: passed
- `ingress-health-production`: valid configuration

Verified image digests:

- Production web: `2a06f79fd24b9c106019b2c09739decfcd552c47e82e1e245da8da132238ce81`
- Production worker: `d7b2b246ce7bebfccb6ccb11bbcd625ffaf55347c0dfff73faaf70ab7472c166`

## Backup Window closure

The reviewed Backup Window was opened only for the Production Phase C2 operation and was closed again after successful acceptance. Its final contract validation reported `ContractValid=True`.

## Explicitly unproven boundaries

This deployment record does not claim:

- public DNS/Cloudflare cutover or redirect removal;
- public `yolpol.com` DNS/TLS monitoring;
- an independent off-host watchdog;
- restore acceptance from the off-server backup;
- disposable rebuild acceptance;
- an end-to-end disaster-recovery cutover exercise;
- automatic restore, PITR, or destructive retention.

Phase C2 durable backup acceptance, healthy Production runtime deployment, public activation, and disaster-recovery restore acceptance remain distinct milestones.
