# Windows Off-server Durability 1 GiB Benchmark Record: 2026-10-04

## Acceptance result

The separately approved maximum-size Windows LocalSystem durability benchmark passed:

```text
ONE_GIB_LOCAL_SYSTEM_BENCHMARK=PASS
```

This record is historical host acceptance evidence for the Task 0077 1 GiB ceiling and an input to the Task 0078 scheduling design. The benchmark used the accepted installed helper before the Task 0078 helper refactor. It does not authenticate or benchmark the final Task 0078 helper bytes and must not be treated as final recurring-activation proof. It also does not register or activate recurring cadence, configure Phase C2, transfer a real Production backup through the VPS adapter, authorize a Production migration, or prove restore/disaster recovery.

## Object identity

```text
Benchmark ID:
yolpol-production-20261004T170000Z-c2a0077b

Artifact size:
1073741824 bytes

Artifact SHA-256:
58802939B37F42BFE94CBCD02280CBCA2DD70713AC054E12E50985BB9B69A0DE

Manifest size:
104 bytes

Manifest SHA-256:
8B68FCD6463837932474B7AB9101F47BEA4C2C04685FD938908B8603C7C1EE1E
```

## Publication and verification

Receipt and detached-signature publication completed 101.929 seconds after the demand-run request. The immutable VPS receipt deadline is 180 seconds, leaving 78.071 seconds at the publication boundary.

The canonical receipt reported:

```text
schemaVersion = 1
artifactSize = 1073741824
durabilityConfirmation = windows-flushfilebuffers-volume-v1
remoteObjectSetId = windows-sftp-v1:/durable/yolpol-production-20261004T170000Z-c2a0077b
```

The detached signature was exactly 384 bytes. Final durable artifact and manifest hashes matched the source pair exactly.

The benchmark harness later printed `TotalObservedSeconds=180.458`. This is not helper runtime and does not change the pass result. The helper publishes the final receipt only after completing its durability path, so 101.929 seconds is the acceptance boundary. The harness measurement loop continued because its Scheduled Task completion-detection condition did not terminate early.

Before recurring activation, the final reviewed Task 0078 helper bytes must be installed and authenticated, their ACL/trust boundary validated, the final task definition validated/imported, and the host must prove there are zero complete unreceipted pending Production pairs. A fresh exact 1 GiB LocalSystem demand-run benchmark must then exercise those final helper bytes inside the unchanged 180-second deadline with reviewed acceptable margin and independently confirmed receipt, signature, and durable hashes. The task must return to Disabled during that acceptance; recurring enablement remains a later separate approval.

## Final host state and boundary

```text
Permanent task final state: Disabled
Final real trigger count: 0
```

No benchmark, durability, backup, receipt, or audit artifact was deleted or cleaned. No secret or private-key material is recorded here. Live recurring activation remains a separate explicitly approved host mutation. Phase C2 remains canonical `{"schemaVersion":1,"state":"unconfigured"}`, and changed-fingerprint Production promotion remains fail-closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`.

## Subsequent acceptance

The final host state above is the state at the end of this 2026-10-04 benchmark and remains historically accurate. In later separately approved work, the final Task 0078 helper and recurring LocalSystem schedule were installed and accepted with no abnormal pending backlog, the VPS adapter was configured and accepted, and the real `v0.2.7` Production controller transaction published deployment-bound Phase C2 evidence before its changed migration completed.

That later acceptance does not turn this pre-Task-0078 benchmark into proof of the final helper bytes. It also does not prove restore, disposable rebuild, PITR, or end-to-end disaster recovery. The committed repository default remains unconfigured and fail-closed for future environments and transactions.
