# Task 0074: Bounded SFTP Readback Containment

## Status and activation boundary

The repository now contains the VPS-side controls required to bound every Windows SFTP readback before bytes can grow beyond its reviewed local-file limit. This is repository hardening only. Phase C2 remains canonical `{"schemaVersion":1,"state":"unconfigured"}`; no SFTP key, host key, Windows CNG key, VPS receipt-verification key, Windows task, destination, credential, or live adapter was provisioned or activated. No VPS, Production, Staging, database, backup, or Windows host was changed.

Changed-fingerprint Production promotion therefore remains fail-closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` until the separate live activation and acceptance procedure succeeds. Task 0074 changes no configuration, durability-evidence, Windows receipt, remote-object-set, RSA-PSS, or Windows helper schema.

## Closed residual risk

Tasks 0071 and 0073 validated downloaded sizes only after an ordinary `sftp get` completed. A malicious or corrupted destination could attempt to fill `/opt/yolpol/runtime/tmp` before that validation rejected the object. Remote listings cannot solve this safely because they are not a kernel write bound and can race the transfer.

Task 0074 uses the already demonstrated Ubuntu 24.04 host primitive:

```text
/usr/bin/prlimit --fsize=N:N -- /usr/bin/sftp ...
```

`RLIMIT_FSIZE` constrains the local file created by the SFTP client. Soft and hard limits are identical. An exact-bound valid download may complete with SFTP exit status 0. If a download exceeds its kernel file-size limit, or the SFTP process otherwise fails, a nonzero exit, signal termination, or timeout is treated as a generic durability failure. Every successful download still must pass the existing exact-size, SHA-256, canonical-receipt, and signature validation. The resource limit is containment, not integrity or authenticity evidence.

## Fixed execution paths

Uploads and downloads are structurally separate:

- the upload runner constructs only the fixed `mkdir`, `put`, and `rename` batch and invokes ordinary `/usr/bin/sftp` without `RLIMIT_FSIZE`;
- the bounded download primitive constructs exactly one `get` and invokes fixed `/usr/bin/prlimit`, fixed `--fsize=N:N`, `--`, and the existing fixed `/usr/bin/sftp` argument vector;
- no production function other than the bounded primitive constructs an SFTP `get`;
- neither a deployment caller nor configuration can select an executable, resource type, limit, remote command, or local destination.

Both paths retain `shell=False`, standard-input batch commands, suppressed stdout/stderr, the minimal `HOME`/`LC_ALL`/`PATH` environment, and existing timeouts. The complete SFTP security policy remains unchanged: no SSH configuration files, passwords, keyboard interaction, GSSAPI, host-key updates, forwarding, local commands, TTY, proxy command, proxy jump, or unpinned algorithm/trust path.

`/usr/bin/prlimit`, `/usr/bin/sftp`, and `/usr/bin/openssl` must be root-owned regular executable files without group/world write permission. Their ancestors must be root-owned directories without group/world write permission. Missing, symlinked, non-executable, wrongly owned, or unsafe paths fail activation validation.

## One object per bounded subprocess

Receipt polling and final readback no longer batch downloads. Each object receives a separate kernel-enforced bound derived only from validated local state or a fixed constant:

| Object | `RLIMIT_FSIZE` value | Mandatory post-download validation |
| --- | ---: | --- |
| canonical durability receipt | `MAX_DURABILITY_RECEIPT_BYTES` = 4096 | regular file, maximum size, canonical eight-field schema, exact pair bindings |
| detached receipt signature | `WINDOWS_RECEIPT_SIGNATURE_BYTES` = 384 | regular file, exact 384 bytes, pinned RSA-3072 PSS/SHA-256 verification |
| durable encrypted artifact | validated `pair.artifact_size` | exact size and SHA-256 |
| durable manifest | validated `pair.manifest_size` | exact size and SHA-256 |

The primitive rejects booleans, non-integers, zero, and negative limits. Remote paths remain derived from the validated backup ID and fixed directories. Local download paths must be new direct children of the adapter-created `TemporaryDirectory` beneath `/opt/yolpol/runtime/tmp`; path escape, existing files, and noncanonical parents are rejected.

An exact-bound object can succeed. A smaller artifact or manifest can pass the kernel bound but fails exact-size or checksum validation. An oversized destination response can create at most the approved local-file length and must fail the SFTP process or later validation; a partial object can never advance to evidence.

## Receipt polling and cleanup

The fixed overall receipt poll timeout, interval, per-process timeout, and maximum attempt count remain bounded. Each attempt downloads the receipt and signature independently. Before an attempt, and after either bounded download fails, its local attempt files are removed. No remote data is deleted, repaired, or overwritten. All files remain inside the protected temporary scope, which is removed on success or failure.

The receipt and signature must both complete and pass their existing checks before RSA-PSS verification and final durable-pair readback. No failed, truncated, missing, oversized, or unauthenticated attempt can publish durability evidence.

## Temporary-filesystem admission

`RLIMIT_FSIZE` bounds each individual destination-controlled write, but a valid large backup still requires two additional artifact copies and two additional manifest copies during staging and final readback. Before creating the adapter `TemporaryDirectory` or staging either large file, the adapter queries free bytes for the filesystem containing `/opt/yolpol/runtime/tmp` and requires:

```text
2 * pair.artifact_size
+ 2 * pair.manifest_size
+ 1 MiB bounded protocol overhead
+ 5 GiB filesystem safety reserve
```

The original encrypted backup already exists and is already reflected in current free space, so it is not counted again. The 1 MiB overhead conservatively covers bounded receipt/signature attempts, the signature-verification message, and small temporary metadata. The fixed 5 GiB reserve matches the established YOLPOL backup-capacity floor. Exact-threshold capacity is accepted; one byte below is rejected. Invalid pair sizes, a manifest above `MAX_MANIFEST_BYTES`, an unavailable filesystem query, a malformed result, or insufficient free space fails before staging and before evidence.

This formula deliberately imposes no arbitrary global artifact-size ceiling. A larger valid Production backup remains admissible when the reviewed temporary filesystem has sufficient headroom.

## Bootstrap and Linux proof

Bootstrap requires fixed `/usr/bin/prlimit` and explicitly installs `util-linux` with the existing prerequisites on the unchanged Debian 12/bookworm and Ubuntu 24.04/noble x86_64 host matrix. Production requires only the OpenSSH client. The disposable deployment image adds `openssh-sftp-server` solely for an isolated direct-mode integration test; it is not a Production bootstrap dependency.

The Linux integration test uses `/usr/bin/prlimit`, `/usr/bin/sftp`, and `/usr/lib/openssh/sftp-server` with temporary local files and no network. It proves that an exact 4096-byte download succeeds with matching SHA-256, while a 4096-byte source under a 1024-byte limit returns nonzero and the destination cannot exceed 1024 bytes.

## Failure and evidence semantics

Any invalid limit or path, missing/insecure executable, filesystem-capacity failure, process start error, nonzero or signal exit, timeout, missing/invalid receipt, signature failure, exact-size mismatch, or SHA-256 mismatch raises only the existing generic durability failure across the controller boundary. No process diagnostics or sensitive paths are published.

All containment and capacity failures occur before `RemoteDurabilityConfirmation` can pass the provider-neutral validator. They produce no canonical evidence, no journal creation, no authority activation, no registry authentication, no image pull, no database deployment, no application or worker replacement, and no schema migration. The existing Phase C2 gate, manual-review behavior, and same-fingerprint Production path are unchanged.

## Validation scope and remaining work

Repository tests cover command construction, the unchanged strict SFTP options, fixed executable selection, invalid limits, nonzero/signal/timeout normalization, all four object bounds, exact-bound success, smaller-object rejection, polling cleanup, upload non-regression, the no-unbounded-`get` structural contract, capacity formula and threshold, capacity-query failure, pre-staging rejection, bootstrap package/executable requirements, and the real Linux `RLIMIT_FSIZE` behavior.

Live Phase C2 work remains separate: provision and accept the Windows roots/ACLs/LocalSystem task and non-exportable CNG key; provision SFTP client/host trust and the pinned VPS public key; validate Tailscale/firewall and native Windows durable-flush behavior; install reviewed repository contracts on the VPS; activate configured JSON; run controlled real backup, receipt, containment, failure, readback, restore, and Production-gate acceptance; and establish operating schedule, monitoring, retention, and recovery procedures. None of that activation occurred in Task 0074.

## Subsequent repository status

Task 0075 adds fixed `--core=0:0` containment to every bounded readback child, producing the command prefix `/usr/bin/prlimit --core=0:0 --fsize=N:N -- /usr/bin/sftp ...`. Upload behavior and all Task 0074 file-size, capacity, validation, and evidence contracts remain unchanged.
