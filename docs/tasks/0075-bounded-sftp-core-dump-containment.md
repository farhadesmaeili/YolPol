# Task 0075: Bounded SFTP Core-Dump Containment

## Status and activation boundary

Task 0075 is a narrow repository-hardening follow-up to Task 0074. Phase C2 remains canonical `{"schemaVersion":1,"state":"unconfigured"}`. No configuration, credential, key, Windows task, destination, VPS, Windows host, Production runtime, Staging runtime, database, backup, or deployment was provisioned, activated, or changed.

Live Phase C2 activation and acceptance remain separate work. Changed-fingerprint Production promotion continues to fail closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` until that work is completed and independently approved.

## Residual closed

Task 0074 correctly bounded each local SFTP download with `RLIMIT_FSIZE`. Its real Linux oversize test also showed that the terminated SFTP child could report `File size limit exceeded (core dumped)`. The file-size bound was effective, but a bounded readback child had no reason to retain the ability to produce a core dump.

Task 0075 fixes the bounded download command contract as:

```text
/usr/bin/prlimit --core=0:0 --fsize=N:N -- /usr/bin/sftp ...
```

Both the soft and hard `RLIMIT_CORE` values are fixed at zero in production source. Callers and configuration cannot select the core limit, another resource type, or another executable. The existing per-object `RLIMIT_FSIZE`, strict SFTP argument vector, minimal environment, `shell=False`, suppressed output, timeout, and one-`get`-per-process contracts are unchanged.

Zero-core containment is defense in depth. It is not durability, integrity, or authenticity evidence. A successful readback must still pass the existing exact-size, SHA-256, canonical-receipt, detached-signature, and remote-object binding checks before positive evidence is possible.

## Upload and protocol non-regression

Uploads continue to invoke ordinary fixed `/usr/bin/sftp` for only `mkdir`, `put`, and `rename`. They do not run behind `prlimit` and receive neither `RLIMIT_CORE` nor `RLIMIT_FSIZE`. Only the bounded download primitive constructs an SFTP `get`.

Task 0075 changes no Phase C2 configuration schema, durability-evidence schema, canonical Windows receipt schema or signed bytes, RSA-PSS policy, `remoteObjectSetId`, backup ID, Windows helper or CNG key contract, SFTP destination layout, capacity formula, polling semantics, exact-size or SHA-256 checks, evidence publication, or Production gate semantics.

## Repository proof

The unit contract asserts the exact production prefix, including the fixed value `--core=0:0`, followed by `--fsize=N:N`, `--`, and `/usr/bin/sftp`. It retains the single-`get`, `shell=False`, minimal-environment, invalid-limit, nonzero-exit, signal-exit, and timeout assertions. The upload regression explicitly rejects `/usr/bin/prlimit`, `--core=`, and `--fsize=` arguments.

The existing disposable Debian Linux integration runs a child through `/usr/bin/prlimit --core=0:0 -- ...` and reads its inherited `RLIMIT_CORE` with Python's standard `resource` module, requiring exactly `(0, 0)`. Its direct SFTP cases use both fixed limits: a source exactly equal to `N` must exit zero, download exactly `N` bytes, and match SHA-256; an oversized source must fail and cannot create a destination larger than `N`. Such a failure cannot become positive durability evidence.

## Remaining work

Live Phase C2 activation and acceptance are still required: provision and validate the Windows roots, ACLs, LocalSystem task, non-exportable CNG signing key, SFTP identity and host trust, pinned VPS verification key, network boundary, native durable flush, controlled backup/readback/restore behavior, operating schedule, monitoring, retention, and recovery procedures. Task 0075 performs none of those live actions.
