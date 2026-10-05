# Task 0078: Phase C2 Bounded Windows Scheduled Cadence

## Status and activation boundary

Task 0078 implements and tests the repository contract for a bounded Windows durability cadence. It does not register, import, enable, or modify a live Windows Scheduled Task. It changes no Windows host, VPS, firewall, Tailscale or SSH configuration, CNG key, SFTP trust, deployed file, database, Docker volume, backup artifact, secret, GitHub setting, or active Phase C2 configuration.

**Task 0078 does not activate the live Windows Scheduled Task.** The permanent host task remains disabled, its final real trigger count remains zero, and live activation requires a separate explicitly approved mutation and acceptance procedure. Phase C2 remains canonical `{"schemaVersion":1,"state":"unconfigured"}`. A Production release with a changed migration fingerprint therefore remains fail-closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` until later activation and real Production end-to-end proof succeed.

## Problem

The Windows helper scans at most 128 fixed Production ingress directories. Before this task, the already-completed receipt path re-opened and SHA-256 hashed each historical durable artifact and manifest on every invocation. Retained 1 GiB artifacts could therefore make a recurring invocation proportional to all historical bytes, destroying a meaningful scheduled-start budget.

A recurring task also cannot depend on overlapping helper processes. The design must combine one bounded helper invocation, a maximum nominal trigger opportunity gap, the existing 900-second Production backup-creation throttle, and a fail-closed response to an abnormal pending backlog.

The scheduled helper is an intake/durability operation, not a retained-data integrity service:

**scheduled hot path != historical data scrub.**

Task 0078 does not claim that historical durable content is periodically re-hashed. A future deep scrub, if desired, requires a separate design and approval.

## Accepted 1 GiB host benchmark

The separately approved Task 0077 maximum-size host benchmark is accepted as subsequent host evidence:

- benchmark ID: `yolpol-production-20261004T170000Z-c2a0077b`;
- encrypted artifact: 1,073,741,824 bytes, SHA-256 `58802939B37F42BFE94CBCD02280CBCA2DD70713AC054E12E50985BB9B69A0DE`;
- manifest: 104 bytes, SHA-256 `8B68FCD6463837932474B7AB9101F47BEA4C2C04685FD938908B8603C7C1EE1E`;
- receipt/signature publication: 101.929 seconds after the demand-run request;
- receipt: schema version 1, exact 1 GiB artifact size, `windows-flushfilebuffers-volume-v1`, and `windows-sftp-v1:/durable/yolpol-production-20261004T170000Z-c2a0077b`;
- detached signature: 384 bytes;
- final durable artifact and manifest hashes matched their sources exactly;
- result: `ONE_GIB_LOCAL_SYSTEM_BENCHMARK=PASS`;
- permanent task final state: Disabled;
- final real trigger count: 0.

The harness later printed `TotalObservedSeconds=180.458`. That is not the helper runtime and is not a benchmark failure. Receipt/signature publication at 101.929 seconds is the acceptance boundary because the helper publishes the final receipt only at the end of its durability path. The measurement loop continued because its Scheduled Task completion-detection condition did not terminate early.

This evidence accepts the one-shot maximum-size host benchmark as historical feasibility evidence and a schedule-design input. It was produced by the accepted installed helper before the Task 0078 helper refactor. Although Task 0078 preserves the strong new-pair durability sequence, this result does not authenticate or benchmark the final Task 0078 helper bytes and therefore does not authorize recurring activation. It also does not configure Phase C2, transfer a real Production backup through the VPS adapter, or prove disaster recovery.

Before recurring activation, a separately approved live-host procedure must:

1. install and authenticate the final reviewed Task 0078 helper bytes;
2. validate the installed helper hash, ACL, and complete trust boundary;
3. validate and import the final reviewed Task Scheduler definition;
4. independently prove `complete unreceipted pending pairs = 0` before enabling the schedule;
5. run a fresh exact 1 GiB LocalSystem demand-run benchmark against those final installed helper bytes;
6. require receipt/signature publication inside the unchanged 180-second deadline with reviewed acceptable margin;
7. independently confirm the receipt, signature, and durable artifact/manifest hashes;
8. return the task to Disabled during acceptance;
9. only after that acceptance, obtain separate approval to enable recurring cadence.

The historical 101.929-second result must not be silently reused as final-helper activation proof.

## Fixed scheduling contract

The canonical future-active definition is:

```text
deploy/windows/offserver-durability/yolpol-offserver-durability-task.xml
```

Its fixed contract is:

- task identity: `YOLPOL-Offserver-Durability-v1`;
- XML principal: LocalSystem SID `S-1-5-18` and `HighestAvailable`, with no XML `LogonType` element;
- executable: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
- arguments: `-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\ProgramData\YOLPOL\offserver-durability\yolpol-durable-write.ps1"`;
- working directory: `C:\ProgramData\YOLPOL\offserver-durability`;
- two enabled deterministic time triggers with fixed start boundaries at `00:00:00` and `00:00:30`;
- each trigger repeats indefinitely every `PT1M`;
- effective maximum nominal trigger opportunity gap: 30 seconds;
- no random delay and no boot, logon, registration, event, idle, session-state, or caller-selected trigger;
- `MultipleInstancesPolicy=IgnoreNew`;
- fixed `ExecutionTimeLimit=PT3M`;
- no credential, password, environment-selected cadence, network profile, or network-availability dependency.

Task Scheduler's repetition schema has a one-minute minimum, so the XML does not attempt an unsupported `PT30S` interval. The two fixed one-minute schedules are offset by exactly 30 seconds, producing a maximum nominal trigger opportunity gap of 30 seconds while no prior instance is running. `IgnoreNew` deliberately rejects an overlapping opportunity instead of starting a parallel helper instance.

`TASK_LOGON_SERVICE_ACCOUNT = 5` is a future registration-procedure API value, not a valid XML `<LogonType>` value. The future live procedure must register LocalSystem with service-account semantics through the appropriate Task Scheduler API and independently export and verify the resulting registered principal. Task 0078 does not perform that registration.

## Native Task Scheduler schema validation

A separately approved read-only host validation on 2026-10-04 tested the then-current repository XML, whose SHA-256 was `D51C599345E42900CFF1D662398489C28A92554AE93A2D6A8EF5C714FE176B7C`. Native Task Scheduler validation first rejected the XML declaration with `(1,40)::ERROR: unable to switch the encoding`. Removing that declaration in memory reached the principal boundary, which rejected the XML value with `(28,35):LogonType:ServiceAccount`.

The already-installed disabled LocalSystem task was exported read-only. Its principal contained `UserId=S-1-5-18` and `RunLevel=HighestAvailable`, with no `LogonType` element. A third validation removed both defects only in memory and called native Task Scheduler COM with `TASK_VALIDATE_ONLY = 1`, `TASK_LOGON_SERVICE_ACCOUNT = 5`, and user `SYSTEM`. It returned:

```text
TASK_SCHEDULER_NATIVE_SCHEMA_VALIDATION=PASS
ValidationTaskExistsAfter=False
LiveStateAfter=Disabled
LiveTriggerCountAfter=0
TASK_0078_NATIVE_VALIDATION_V3=PASS
```

The repository XML hash remained unchanged during that acceptance procedure. This evidence led to the repository corrections in this pass: the canonical file now begins directly with `<Task>` and the principal omits `LogonType`. The Windows-only regression test also sends the actual corrected canonical repository XML through the same native validate-only boundary and proves its distinct validation task name remains absent afterward. Neither validation installed the corrected XML as the live task, activated cadence, enabled the existing task, or added a live trigger.

## Deadline budget

The immutable VPS receipt poll contract remains:

```text
overall deadline:    180 seconds
poll interval:         5 seconds
per-attempt timeout:  15 seconds
maximum attempts:     37
```

The accepted historical maximum-size publication result and maximum nominal trigger opportunity gap give the design estimate:

```text
30 + 101.929 = 131.929 seconds
180 - 131.929 = 48.071 seconds remaining
```

A conservative allowance for one blocked/missed 15-second fetch and one 5-second polling sleep gives:

```text
30 + 101.929 + 15 + 5 = 151.929 seconds
180 - 151.929 = 28.071 seconds remaining
```

These measurements are design evidence, not a guaranteed Windows start latency, dispatch SLA, or runtime configuration. Host suspension, scheduler delay, resource pressure, missed triggers, or an already-running instance can cause a later actual start. Such conditions must fail closed through the unchanged Phase C2 deadline; the task XML and helper cannot change the polling deadline, interval, attempt timeout, maximum attempts, backup throttle, or artifact ceiling. A future materially slower host or runtime requires a new benchmark and review, not a silently extended timeout. Final activation still requires the fresh final-helper benchmark above.

## Bounded helper hot path

Every invocation still validates the complete fixed trust boundary before Production enumeration. It then performs one bounded structural scan, rejects abnormal or collided state, classifies completed and pending pairs, and only after the scan selects a pending pair.

For an already completed pair, the helper still requires:

- a bounded plain receipt and an exact 384-byte plain signature;
- canonical receipt/signature ACLs;
- a plain durable directory with canonical ACLs;
- exactly the expected artifact and manifest entries;
- canonical ACL, regular-file, reparse, exact-path, and single-hard-link checks for both durable files;
- RSA-PSS verification of the exact receipt bytes with the fixed validated CNG key;
- exact canonical receipt schema with no extensions, UTF-8/BOM ambiguity, alternate field order, noncanonical hash, wrong backup ID, wrong constants, or alternate `remoteObjectSetId`;
- positive receipt sizes, a manifest no larger than 65,536 bytes, and exact durable file-length equality with the authenticated receipt.

The completed path no longer calls `Get-PlainFileDigest` or reads historical payload content. Its work is bounded by entry counts and small receipt/signature sizes rather than retained artifact bytes. The authenticated receipt preserves the LocalSystem durability authority's original hashes and sizes, while the VPS adapter independently performs exact final `/durable` size/SHA-256 readback for the active target pair before positive Phase C2 evidence.

For a newly pending pair, the existing strong path remains unchanged: streamed write-through copy, per-file flush, non-replacing publication, final artifact and manifest re-hash, fixed-volume `FlushFileBuffers`, canonical receipt construction, RSA-PSS signing, signature publication, then receipt publication as the final positive marker. No expensive operation follows receipt publication.

## Pending-pair bound and throttle

Both fixed Production backup wrappers retain `MIN_BACKUP_INTERVAL_SECONDS=900`. Normal controller operation therefore cannot create two wrapper-created Production backups within 900 seconds.

The helper nevertheless scans and classifies the complete bounded ingress before mutation. Zero complete unreceipted pairs is an idle success. Exactly one is processed. More than one fails closed with a fixed manual-review error before any durable directory is created. The helper never serially processes multiple 1 GiB pairs in one invocation.

**Recurring schedule must not be enabled with an existing complete unreceipted Production backlog.** Activation must independently prove `complete unreceipted pending pairs = 0`. Otherwise an old pair could occupy the single helper instance while `IgnoreNew` rejects later trigger opportunities, invalidating the simple maximum nominal trigger opportunity-gap budget if another eligible backup later arrives. After a clean activation, the fixed 900-second wrapper throttle plus the one-pending-pair fail-closed helper policy provide the normal-operation bound. Task 0078 does not drain, delete, or process multiple backlog entries automatically.

Incomplete uploads retain the previous behavior and wait for a later scan. Unexpected entries, reparse or non-directory roots, invalid identities, receipt/signature orphans, partial/final collisions, conflicting complete pairs, durable-directory collisions, unsafe ACL/type/path/hard-link state, malformed receipts, and invalid signatures continue to fail closed. No source or durable object is deleted, moved, repaired, overwritten, retained, or pruned by Task 0078.

## Repository tests

The helper tests prove trust validation precedes enumeration; fixed root/per-directory bounds remain; completed history contains no payload digest operation; strict receipt parsing and signature verification remain; durable lengths bind to authenticated sizes; ACL/type/path/hard-link checks remain; a new pair retains streamed copy, final re-hash, volume flush, RSA-PSS signing, signature-before-receipt ordering, and final receipt publication; and zero/one pending pair is accepted while a multiple-pair backlog fails closed.

The Scheduled Task tests parse the XML with Python's standard XML parser on every platform and prove the absence of an XML declaration/encoding and `LogonType`, the exact LocalSystem `UserId`/`RunLevel` principal, action, working directory, two fixed one-minute time triggers, exact 30-second offset and maximum nominal trigger opportunity gap, enabled state, prohibited-trigger absence, no random delay, `IgnoreNew`, three-minute execution bound, no network dependency, no credential/caller controls, and unchanged cross-contract constants:

- `MIN_BACKUP_INTERVAL_SECONDS=900`;
- `SFTP_RECEIPT_POLL_TIMEOUT_SECONDS=180`;
- `SFTP_RECEIPT_POLL_INTERVAL_SECONDS=5`;
- `SFTP_RECEIPT_ATTEMPT_TIMEOUT_SECONDS=15`;
- `SFTP_RECEIPT_MAX_ATTEMPTS=37`;
- `MAX_ARTIFACT_BYTES=1 * 1024 * 1024 * 1024`.

Windows-only tests execute the isolated pending selector and strict canonical receipt parser in memory. A separate Windows-only test reads the actual canonical XML, calls Task Scheduler COM `RegisterTask` with `TASK_VALIDATE_ONLY = 1`, user `SYSTEM`, and `TASK_LOGON_SERVICE_ACCOUNT = 5`, and proves the fixed validation-only task name is absent before and after. It does not alter the production task, enable or start a task, create a live trigger, change ACLs, access the CNG key, or write backup data. Non-Windows CI skips only this native COM test while retaining all structural assertions.

## Security invariants and remaining work

Task 0078 changes no receipt schema, canonical newly generated bytes, signature bytes, signing domain, CNG authority, `remoteObjectSetId`, fixed roots/account, ACL policy, LocalSystem requirement, path/reparse/hard-link checks, exclusive/write-through copy semantics, fixed-volume flush, or VPS final readback. It adds no production argument, network action, delete, cleanup, repair, retention, or concurrency fallback.

Remaining separately approved work includes installing and authenticating the final reviewed XML/helper bytes, proving a zero-pending activation state, running and accepting the fresh final-helper 1 GiB benchmark, validating the exact registered task and exported principal/trigger behavior on the live host, separately enabling the task, configuring the fixed VPS adapter and trust material, transferring and independently verifying a real Production pair, publishing canonical Phase C2 evidence, accepting the changed-migration-fingerprint gate, and completing restore/disaster-recovery proof.
