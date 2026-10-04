# Task 0077: Phase C2 Bounded Artifact Size

## Status and activation boundary

This is a repository-only Phase C2 hardening task. It changes no Windows host, VPS, Production or Staging runtime, database, Docker volume, secret, key, Scheduled Task, firewall, SSH configuration, deployed file, or active configuration. Phase C2 remains canonical `{"schemaVersion":1,"state":"unconfigured"}` and changed-fingerprint Production promotion remains fail-closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`.

Prior host acceptance successfully exercised native durable copy, final re-hash, fixed-volume `FlushFileBuffers`, canonical receipt generation, RSA-PSS signing, and LocalSystem execution on the actual fixed NTFS `E:` volume. The permanent Windows Scheduled Task exists but is disabled and has no automatic trigger. Those results do not activate Phase C2 and do not include the 1 GiB maximum-size benchmark introduced here.

The fixed encrypted Production backup artifact maximum is:

```text
MAX_ARTIFACT_BYTES = 1 * 1024 * 1024 * 1024
                   = 1,073,741,824 bytes
                   = 1 GiB
```

This is only the Phase C2 encrypted artifact eligibility ceiling. It is not a database-size limit and is not a public Product or application limit. It is fixed source policy: no caller, configuration, environment variable, deployment intent, remote response, or free-space result can supply, increase, or bypass it.

## Eligibility and ordering

Local `BackupPair` inspection requires the encrypted artifact size to satisfy `1 <= artifact_size <= MAX_ARTIFACT_BYTES`. Exactly 1 GiB is accepted; 1 GiB plus one byte is rejected. The manifest contract remains independently bounded by `1 <= manifest_size <= MAX_MANIFEST_BYTES`.

Inspection occurs before the remote adapter is invoked. An oversized artifact therefore fails before temporary staging, capacity admission, SFTP upload, receipt polling, remote readback, `RemoteDurabilityConfirmation`, or evidence publication. It cannot advance the Production controller to journal creation, authority activation, registry authentication, image pull, database deployment, application or worker replacement, or schema migration.

The observed Production files during host inspection were far smaller: the largest encrypted artifact was 176,272 bytes, another artifact was 1,084 bytes, manifests were approximately 895 and 881 bytes, and the backups directory was approximately 192 KiB. Those observations are informational only. They do not define, tune, or justify the fixed limit.

## Independent capacity and readback bounds

The eligibility ceiling does not replace temporary-filesystem admission. After a pair is validated, the adapter still requires free capacity from its actual sizes:

```text
2 * pair.artifact_size
+ 2 * pair.manifest_size
+ TEMPORARY_PROTOCOL_OVERHEAD_BYTES
+ TEMPORARY_FILESYSTEM_SAFETY_RESERVE_BYTES
```

The fixed 1 MiB protocol overhead and 5 GiB filesystem safety reserve remain unchanged. Both the 1 GiB eligibility bound and the free-space capacity bound must pass.

Final durable artifact readback also remains bounded to the exact validated `pair.artifact_size`, not `MAX_ARTIFACT_BYTES`. Exact expected size and SHA-256 validation remain mandatory. Receipt, signature, and manifest readbacks retain their existing independent bounds.

## Fixed 180-second activation benchmark

The receipt polling deadline remains exactly 180 seconds, with its existing fixed interval, per-attempt timeout, and maximum-attempt ceiling. It is not caller-adjustable. A finite maximum permitted artifact size is required so activation can test a concrete worst-case contract: Scheduled Task start latency plus Windows durable copy, per-file flush, final readback and hash, fixed-volume `FlushFileBuffers`, signature and receipt publication must reliably complete for a 1 GiB encrypted artifact inside that immutable deadline.

This repository task does not claim that runtime result and authorizes neither the one-shot/demand-run host benchmark nor recurring cadence activation. An actual 1 GiB benchmark through the accepted LocalSystem helper on the fixed NTFS `E:` volume is a separately approved host-acceptance step. Recurring cadence may be separately activated only after that benchmark passes with acceptable margin and every other prerequisite for that activation is satisfied.

## Intentional Task 0074 policy change

Task 0074 deliberately imposed no arbitrary global artifact-size ceiling: at that task's completion, a larger valid Production backup remained admissible when the temporary filesystem had sufficient headroom. Task 0077 intentionally supersedes only that specific policy because live activation requires a finite maximum permitted backup size that can be benchmarked against the fixed 180-second deadline.

Task 0074's per-object kernel containment and independent temporary-capacity formula remain authoritative. Its historical document is not rewritten as though the ceiling existed then.

## Windows helper boundary

The Windows durable-write helper is unchanged. The VPS validates the local `BackupPair` before invoking the adapter, uploads that exact immutable pair, requires the authenticated canonical receipt to bind its exact sizes and hashes, and independently reads back the same exact pair. A different or oversized Windows object cannot satisfy those bindings or publish positive evidence for the validated local pair. Mirroring the limit in the helper is therefore not required for this repository-side eligibility and activation-benchmark contract.

No receipt field, encoding, size maximum, detached-signature size, RSA-PSS/SHA-256 policy, CNG key contract, pinned verification authority, signing domain separator, SFTP destination layout, backup ID, `remoteObjectSetId`, deployment or migration binding, or evidence schema changes.

## Validation and remaining live work

Repository tests cover the exact constant, one-byte and exact-limit acceptance, zero-byte and one-byte-over rejection, unchanged manifest maximum, pre-adapter rejection with no evidence, non-configurability, the actual-size temporary-capacity formula, and exact-pair readback limits.

These items remain not done:

- run and accept the separately approved one-shot/demand-run 1 GiB LocalSystem maximum-size benchmark within the fixed 180-second deadline;
- only after that benchmark passes, activate the recurring Windows Scheduled Task trigger and operating cadence;
- activate the Phase C2 configured state and its reviewed host trust material;
- transfer a real Production encrypted backup through the configured adapter;
- publish and validate end-to-end signed durability evidence on the VPS;
- accept the Production changed-migration-fingerprint gate through the live path;
- complete the restore/disaster-recovery drill and any other pending recovery acceptance.

No live activation, configured transfer, or disaster-recovery proof is implied by this task.
