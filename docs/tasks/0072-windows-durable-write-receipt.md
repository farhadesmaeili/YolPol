# Task 0072: Windows Durable-write Receipt

> Pre-activation subsequent status: Task 0073 implements fixed authenticated provenance for this unchanged canonical receipt by publishing a detached RSA-PSS signature and verifying it with a pinned VPS public key. Later host acceptance successfully exercised native durable copy, final re-hash, fixed-volume `FlushFileBuffers`, canonical receipt generation, RSA-PSS signing, and LocalSystem execution on the actual fixed NTFS `E:` volume. Task 0077 fixes the maximum eligible Phase C2 encrypted artifact at 1 GiB, and the separately approved 2026-10-04 maximum-size benchmark passed against the pre-Task-0078 helper with receipt/signature publication at 101.929 seconds inside the unchanged 180-second deadline. Task 0078 adds the repository-only bounded cadence definition and completed-history fast path. The historical benchmark is schedule-design evidence rather than final-helper activation proof; activation required a zero-pending state and reviewed acceptance of the final installed Task 0078 helper bytes. At the point recorded by this paragraph, the permanent Scheduled Task remained disabled with no automatic trigger and zero real trigger count, and Phase C2 activation had not occurred. The unsigned/future-authentication statements below retain the Task 0072 boundary at completion.

> Later live acceptance: the final Task 0078 helper and recurring LocalSystem schedule were subsequently installed and accepted with no abnormal pending backlog; the authenticated receipt authority and configured VPS adapter were accepted; and the real `v0.2.7` controller transaction published deployment-bound durability evidence before migration `0024_phase_c2_live_acceptance`. The committed repository default remains unconfigured and fail-closed. Restore/disaster-recovery acceptance remains separate.

## Status and activation boundary

The Windows durable-copy helper, canonical receipt protocol, bounded VPS receipt polling, and final durable-store readback are implemented in the repository and covered by synthetic/static tests. The helper also contains fail-closed runtime path, hard-link, local-account, group-membership, installation-path, owner, and DACL validation. They are **not live**. This task did not create Windows directories, apply ACLs, install a Scheduled Task, run the helper as LocalSystem, refresh VPS contracts, configure the active adapter, provision a client key or host key, upload a Production backup, change Tailscale, or change Production or Staging.

The adapter deliberately does **not** turn this unsigned receipt into positive Phase C2 evidence. SFTP cannot attest that the helper's runtime ACL checks executed, so a host whose SFTP ACLs had drifted could let `yolpol-backup` forge both durable objects and their matching receipt. Until a separately reviewed authenticated receipt authority or equivalent remotely verifiable trust mechanism exists, even a canonical receipt plus exact `/durable` readback ends with `DurabilityUnavailable` and publishes no evidence.

The repository still defaults to canonical `{"schemaVersion":1,"state":"unconfigured"}`. Until a separately reviewed activation installs and validates every host-side prerequisite, changed-fingerprint Production promotion remains fail-closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`.

## Fixed architecture

The intended Windows OpenSSH chroot is `E:\yolpol-backups`, with three fixed children:

```text
E:\yolpol-backups\production            SFTP ingress
E:\yolpol-backups\durable               helper-owned final object store
E:\yolpol-backups\durability-receipts   helper-owned receipt store
```

The corresponding SFTP paths are `/production`, `/durable`, and `/durability-receipts`. The `windows-sftp-v1` configuration now accepts `remoteDirectory` only when it is exactly `/production`. The adapter uploads only to that ingress tree. It never issues an SFTP write, rename, create, or delete beneath `/durable` or `/durability-receipts`; it only reads the helper-owned final objects and receipt from those trees.

The reviewed source helper is:

```text
deploy/windows/offserver-durability/yolpol-durable-write.ps1
```

Activation must install those exact authenticated bytes outside the chroot at the fixed path `C:\ProgramData\YOLPOL\offserver-durability\yolpol-durable-write.ps1`. The containing directory and file must be protected, canonical, owned by SYSTEM or BUILTIN\Administrators, and have only the helper's exact SYSTEM/Administrators Full Control DACL. The helper refuses to run from another path or through a reparse point, alternate resolved path, or hard link. It has no production arguments, network access, SSH/SFTP client, remote command path, caller-selected command, caller-selected filesystem root, overwrite, deletion, or cleanup behavior. It performs one bounded scan of the fixed Production ingress root and exits. A future Scheduled Task may invoke it as LocalSystem.

## Eligible ingress pairs

Only plain directories matching the existing Production identity contract are considered:

```text
yolpol-production-YYYYMMDDTHHMMSSZ
yolpol-production-YYYYMMDDTHHMMSSZ-<7-to-64-lowercase-hex-revision>
```

An eligible directory must contain exactly these two final regular files and no partials or unexpected entries:

```text
<backupId>.dump.age
<backupId>.manifest.json
```

Directories with an incomplete expected upload are ignored for that scan. Reparse points, non-regular entries, invalid identities, unexpected filename shapes, complete pairs with conflicting partials, durable-directory collisions, and receipt-partial collisions fail closed. An existing final receipt marks an already completed helper operation only when its plain durable directory contains exactly the expected final pair and its bytes exactly equal a reconstructed canonical receipt from those final durable hashes and sizes. Malformed, mismatched, missing-counterpart, partial, extra-entry, or otherwise collided state requires reviewed manual intervention. The helper never repairs or deletes it.

> Subsequent Task 0078 behavior: the preceding paragraph records the Task 0072 completion-state implementation. The recurring completed-pair path now reads only bounded receipt and detached-signature bytes, verifies the signature through the fixed CNG authority, and accepts the receipt only when its bytes have the exact canonical schema and encoding with the fixed backup ID, constants, and object-set identity. Receipt-recorded sizes must be valid. The durable artifact and manifest retain their ACL, regular-file, reparse-point, exact-path, and single-hard-link checks, and their exact file lengths must equal the authenticated receipt sizes. Historical artifact and manifest payload content is not re-hashed during each scheduled invocation: **scheduled hot path != historical data scrub**. The unchanged new-pair path still performs its full final-object re-hash before volume flush and receipt publication.

## Durable-copy and flush sequence

For each eligible pair the helper performs this fixed sequence:

1. Atomically creates a new `E:\yolpol-backups\durable\<backupId>` directory; an existing object fails.
2. Opens each ingress source with `FILE_FLAG_OPEN_REPARSE_POINT` and share-read only, rejects directories/reparse points and any link count other than one from handle metadata, resolves the opened handle with `GetFinalPathNameByHandleW`, and requires a case-insensitive exact match to its fixed expected DOS path on `E:`. It holds that verified source handle while copying. The same handle-level identity checks apply to final durable readback, existing receipts, and the installed helper itself.
3. Streams each source into a new destination `.partial` opened with `CREATE_NEW`, no sharing, and `FILE_FLAG_WRITE_THROUGH`; it calculates SHA-256 and byte count while writing and calls `FileStream.Flush(true)`.
4. Publishes both final durable names with non-replacing `MoveFileExW(..., MOVEFILE_WRITE_THROUGH)` calls. The helper names this primitive `MoveNewNoReplace`: same-volume rename is only name publication, and `MOVEFILE_WRITE_THROUGH` is not treated as proof of durability.
5. Reopens the final durable files with the same no-reparse/share-read handle policy, streams and re-hashes them, and requires exact size and SHA-256 equality with the bytes written.
6. Opens the fixed `\\.\E:` volume and requires `FlushFileBuffers` to succeed.
7. Only after that volume flush, builds the canonical receipt, creates its `.partial` with `CREATE_NEW` and write-through semantics, flushes it with `FileStream.Flush(true)`, and publishes the final receipt with a non-replacing rename. That final rename is the publication marker and there is no later fallible operation for that backup. If a crash loses the receipt publication, the VPS observes no receipt and fails closed; the rename itself is not claimed as a second durability proof.

There is no weaker fallback. If the fixed volume cannot be opened or `FlushFileBuffers` fails, no final receipt is published. Failure may leave immutable partial/collision state; the helper does not remove it, and retry requires reviewed manual incident handling.

## Host-storage checks

Before scanning, the helper requires a ready local fixed `E:` volume formatted as NTFS. It requires the chroot, ingress, durable, and receipt roots to exist at their exact canonical paths as plain non-reparse directories. It resolves the exact local `COMPUTERNAME\yolpol-backup` SID with a round trip, requires that account to belong only to BUILTIN\Users (including indirect local-group enumeration), and fails if any identity cannot be resolved. Every fixed root must have a protected canonical DACL, a SYSTEM-or-Administrators owner, no inherited/deny/unexpected ACE, and exactly the documented trustees, rights, and inheritance flags. This trust validation happens before Production enumeration and therefore before either new-pair handling or the existing-receipt fast path. Existing durable directories/files and final receipts must also have a SYSTEM-or-Administrators owner and exactly the expected canonical inherited child DACL; this prevents unsafe leaf state from surviving an earlier ACL-drift window after the roots are repaired. The same child checks run on newly created durable directories and partial files, including the receipt partial before its final publication rename. Each scanned object is checked again at the filesystem-entry and opened-handle boundaries. The helper does not silently substitute another drive, volume, filesystem, root, account, ACL shape, or flush mechanism.

Repository tests validate this code and ordering statically. They do not claim that native `FlushFileBuffers` ran successfully on the future backup host. That requires a separately approved LocalSystem activation test on the actual fixed NTFS `E:` volume.

## Canonical receipt

The final receipt is `E:\yolpol-backups\durability-receipts\<backupId>.json`, visible over SFTP as `/durability-receipts/<backupId>.json`. It is UTF-8 without BOM, compact sorted-key JSON, bounded to 4096 bytes, and has exactly one trailing LF:

```json
{"artifactSha256":"<64-lowercase-hex>","artifactSize":1,"backupId":"<backupId>","durabilityConfirmation":"windows-flushfilebuffers-volume-v1","manifestSha256":"<64-lowercase-hex>","manifestSize":1,"remoteObjectSetId":"windows-sftp-v1:/durable/<backupId>","schemaVersion":1}
```

The numeric sizes above illustrate the field types; actual values are the exact positive byte counts of the verified final durable objects. The receipt contains no Windows timestamp. It binds only the fixed backup identity, exact final-pair hashes and sizes, fixed confirmation class, fixed deterministic object-set identity, and schema version.

When produced by the reviewed helper under its validated trust boundary, the confirmation records that the Windows storage stack successfully completed the required write-through destination operations, explicit file flushes, final-name publication, final-object re-hash, and fixed-volume `FlushFileBuffers` operation before the receipt became visible. The unsigned receipt does not itself authenticate that provenance to the VPS, and it does not prove protection against storage hardware or firmware that violates or fails to honor the platform's write-through/flush guarantees.

## VPS polling, validation, and final readback

After the existing immutable upload to `/production/<backupId>`, the adapter polls only `/durability-receipts/<backupId>.json`. The constants are fixed in source: a 180-second overall deadline, 5-second interval, 15-second per-attempt SFTP timeout, and 37-attempt hard ceiling. No deployment intent or caller controls the path or timing. Missing/unavailable receipt fetches may retry until the fixed bound; a fetched malformed or mismatched receipt fails immediately.

Receipt validation rejects empty/oversized content, invalid UTF-8, BOM, duplicate keys, unknown/missing fields, non-finite values, noncanonical bytes, wrong JSON types, wrong schema, backup ID, hashes, sizes, confirmation string, or object-set identity.

After a valid receipt, the adapter independently downloads only:

```text
/durable/<backupId>/<backupId>.dump.age
/durable/<backupId>/<backupId>.manifest.json
```

It requires both readback files to be regular local temporary files with exact expected sizes and SHA-256 values from the already validated local `BackupPair`. The adapter then raises `DurabilityUnavailable` because the receipt has no authenticated authority that the VPS can verify. It never constructs a `RemoteDurabilityConfirmation` and never reaches Task 0069 canonical evidence publication. The helper cannot write Phase C2 evidence. An ingress readback, SFTP process exit status, `sftp -f`, caller boolean, unsigned or manually supplied receipt bytes, receipt without final durable readback, or canonical matching receipt and durable pair cannot publish evidence.

The 180-second polling deadline is a deployment contract, not an arbitrary object-size guarantee. Any future activation must measure and verify that the Scheduled Task start latency plus copy, per-file flush, final readback/hash, fixed-volume flush, and receipt publication for the permitted maximum backup size reliably complete inside that bound. Otherwise activation remains prohibited; the timeout must not be bypassed dynamically.

Task 0077 subsequently defines that permitted maximum as exactly 1 GiB without changing this deadline. The separately approved LocalSystem 1 GiB runtime benchmark passed on 2026-10-04 at 101.929 seconds to receipt/signature publication against the installed pre-Task-0078 helper. That historical host evidence does not prove the final helper activation budget or activate the still-disabled recurring task or Phase C2. A fresh benchmark against the final installed Task 0078 helper bytes remains mandatory after independently proving zero pending pairs.

## Windows ACL and execution contract

A later reviewed activation must establish and independently verify the exact ACL model enforced at helper runtime:

- `E:\yolpol-backups`: protected explicit SYSTEM/Administrators inheritable Full Control plus `yolpol-backup` non-inheriting ReadAndExecute.
- `E:\yolpol-backups\production`: protected explicit SYSTEM/Administrators inheritable Full Control plus `yolpol-backup` inheritable Modify.
- `E:\yolpol-backups\durable`: protected explicit SYSTEM/Administrators inheritable Full Control plus `yolpol-backup` inheritable ReadAndExecute.
- `E:\yolpol-backups\durability-receipts`: protected explicit SYSTEM/Administrators inheritable Full Control plus `yolpol-backup` inheritable ReadAndExecute.
- `C:\ProgramData\YOLPOL\offserver-durability`: protected explicit inheritable Full Control for SYSTEM/Administrators only; the installed helper file has protected explicit non-inheriting Full Control for only those two trustees.

These names describe the logical permission contract. For exact runtime mask comparison, the helper canonicalizes every expected Allow ACE to Windows/.NET's representation by including `Synchronize`; it still requires exact numeric equality and rejects missing or additional rights.

The helper is expected to run as LocalSystem because volume flushing requires administrative privilege. Activation must separately verify the exact runtime checks, the SFTP account's effective inability to create/modify/rename/delete beneath the durable and receipt roots, its intended ingress access, successful native volume flush, and the schedule-latency/maximum-size deadline above. This repository task applies none of those ACLs and installs no Scheduled Task. These checks are defense in depth on Windows; they do not solve remote receipt authentication, so positive adapter confirmation remains disabled.

## Ordering and fail-closed behavior

The changed-fingerprint Production order remains:

```text
exact Staging success
-> Production health
-> fresh encrypted Production backup
-> local integrity and deep verification
-> immutable /production upload
-> bounded Windows receipt validation
-> exact /durable final-pair readback
-> authenticated receipt-authority verification (not implemented; fail closed)
-> Task 0069 evidence validation/publication (unreachable for windows-sftp-v1 today)
-> journal and authority mutation
-> registry authentication and image pull
-> Production database/application/worker replacement
-> fixed Production migration
```

Missing, malformed, mismatched, unavailable, stale, collided, unreadable, or unconfirmed state fails before Production mutation with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`. Same-fingerprint Production behavior is unchanged.

## Tests and residual risks

Python tests cover canonical receipt parsing, every receipt field/type/binding failure, malformed JSON, BOM, duplicate/unknown fields, oversized receipts, fixed path derivation, bounded polling, receipt-only and readback-only failure, both durable checksum mismatches, upload/receipt/readback failure, the mandatory post-readback authentication failure with no evidence, the existing provider-neutral evidence path, controller ordering, and same-fingerprint compatibility. Vitest statically verifies the helper's fixed roots and identities, protected canonical exact ACL contract, unresolved-account/group rejection, trust-check ordering ahead of existing receipts, exact handle-resolved paths, one-link requirement, bounded scan, backup-ID contract, reparse/collision defenses, streamed `CREATE_NEW` write-through path, mandatory volume flush, canonical receipt order/encoding, publication ordering, and absence of network, external ACL command, delete, overwrite, and weaker buffering paths. Parser and embedded-C# compilation validate syntax only; tests do not fake native ACL or flush success.

Still deferred:

- live Windows roots, ACLs, ownership, helper installation, LocalSystem Scheduled Task, and native flush validation;
- an authenticated receipt authority or equivalent VPS-verifiable proof of helper provenance; without it the adapter intentionally cannot return positive confirmation;
- live VPS contract refresh, configured JSON, real client key, and independently pinned host key;
- Tailscale/firewall reachability and SFTP read/write-boundary validation;
- a real encrypted Production backup upload, durable receipt, readback, and restore drill;
- Production changed-fingerprint activation;
- retention, cleanup, partial/collision recovery automation, and off-host monitoring;
- a reliable pre-transfer size bound for completed SFTP `get` operations. Receipt and durable-object downloads are checked immediately after completion, but the Task 0071 temporary-filesystem exhaustion risk remains.

Repository implementation is not live activation and is not a complete disaster-recovery proof.
