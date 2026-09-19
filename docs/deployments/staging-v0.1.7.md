# Staging Deployment Record: v0.1.7

## Deployment result

YOLPOL release `v0.1.7` was successfully promoted to Staging and verified. Deployment health, service status, and the release-specific smoke test all passed.

## Environment and release identity

- Environment: Staging
- Version: `0.1.7`
- Tag: `v0.1.7`
- Git SHA: `6b4833c876d562a78369cb1c34663002508aeb97`
- Platform: `linux/amd64`

The purpose of this release was to fix the race condition between Customer-message translation and Telegram Staff notification delivery.

## Release manifest verification

The version-1 `release-manifest.json` was downloaded from the authenticated GitHub Release. Its SHA-256 verification completed successfully before promotion. The manifest identified the release platform as `linux/amd64`.

## Database and migration decision

- Latest migration: `0023_telegram_notification_destinations`
- Migration-set SHA-256: `48bfbae76d5421516cfca1406c47e509e0e9c89edac3cda048c08aa15e190f24`
- Comparison result: identical to `v0.1.6`
- Promotion decision: no migration was executed

Because the migration set was unchanged, the `v0.1.7` promotion did not require a database migration.

## Pre-promotion protection and rollback

Before promotion, Staging was healthy on `v0.1.6`, the readiness health check passed, and the official deployment-wrapper validation passed. Encrypted backup creation also completed successfully.

A rollback snapshot was created at:

```text
/opt/yolpol/releases/pre-v0.1.7-20260915T000141Z
```

The snapshot provides the recorded rollback point for this promotion. The unchanged migration set also means this release introduced no migration transition to reverse. No rollback was required.

## Immutable runtime image digests

| Runtime role | Verified digest |
| --- | --- |
| Web | `sha256:db1c8f919533210a047c6430493cbfb478b3e97e734b4d25be22ee56875e07d3` |
| Worker | `sha256:c919c835956799da3f91e0ce88784f7d8c2b2f476a621c795c049b57086bfc64` |
| Operations Metrics | `sha256:4818879034de2ac04abf3895e0d82ce0116e955290047395a3feca3493c4724b` |
| Migration | `sha256:d98add03b211d483d2658e3f2ed47bef3e61d1b7d5edf01dd95b81a1c82ccd8b` |
| Backup/restore | `sha256:8462ebc85b918907b1f244728447596832354024e78f05646f446722863c1a86` |

## Promotion summary

The promotion proceeded through these high-level steps:

1. Confirmed Staging `v0.1.6` readiness and validated the official deployment wrapper.
2. Created the encrypted pre-promotion backup and rollback snapshot.
3. Updated the active release manifest to `v0.1.7`.
4. Updated Staging runtime references and the Monitoring Operations Metrics reference to the approved immutable `v0.1.7` digests.
5. Revalidated the deployment configuration and pulled the approved images.
6. Deployed the web runtime and all three workers.
7. Kept the edge healthy and recreated the Operations Exporter with the `v0.1.7` image.
8. Verified final deployment health, service status, and the release-specific smoke test.

## Final health verification

- Deployment health: `ready`
- Health exit code: `0`
- Status exit code: `0`
- Web: healthy
- PostgreSQL: healthy
- Inquiry Notifications worker: running
- Conversation Translation worker: running
- Conversation AI Fallback worker: running
- Monitoring stack: running
- Operations Exporter: running on the new `v0.1.7` digest

## Smoke test

A real Staging Inquiry was submitted. Customer-message translation completed correctly, and the Telegram notification arrived after translation. The original race condition was not reproduced.

Smoke-test result: **PASS**.

## Conclusion

Staging `v0.1.7` is verified. The approved immutable images are running, the environment is healthy, the translation-before-notification behavior passed its real Staging smoke test, and the recorded rollback point remains available.
