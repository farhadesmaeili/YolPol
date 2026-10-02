# Task 0073: Authenticated Windows Durability Receipt Provenance

## Status and repository-only boundary

The repository now implements a fixed cryptographic provenance check for the Task 0072 Windows durability receipt. A `windows-sftp-v1` adapter can return a positive `RemoteDurabilityConfirmation` only after it verifies a detached RSA-PSS signature over the exact canonical receipt bytes and independently reads back the exact final pair from `/durable`.

This is not live activation. This task did not create or modify a Windows CNG key, Windows ACL, Scheduled Task, OpenSSH configuration, `authorized_keys`, VPS trust file, active durability configuration, Tailscale policy, database, backup, deployment, or Production/Staging runtime. The repository still defaults to canonical `{"schemaVersion":1,"state":"unconfigured"}`. No Windows signing key is claimed to exist, no VPS verification key is claimed to be installed, and no end-to-end backup is claimed to have succeeded. Phase C2 remains incomplete pending separately approved live activation and acceptance work.

## Problem and security objective

Task 0072 deliberately rejected its unsigned receipt as positive evidence. SFTP authenticates the destination server, but an SFTP identity is not the dedicated durability authority and cannot prove that the protected helper performed the reviewed durable-write sequence. Task 0073 adds a separate, pinned signing authority without changing the provider-neutral evidence schema or permitting caller-selected trust.

A positive Windows confirmation requires all of these independently:

- immutable SFTP ingress upload of the validated encrypted artifact and manifest;
- an exact canonical Task 0072 receipt for the active backup ID;
- a detached signature from the fixed Windows durability signing authority;
- exact receipt bindings for both hashes, both sizes, `windows-sftp-v1:/durable/<backupId>`, and `windows-flushfilebuffers-volume-v1`;
- exact final artifact and manifest downloads from `/durable/<backupId>`;
- exact size and SHA-256 agreement between both downloads and the locally inspected fresh backup pair.

The fixed public key and OpenSSL policy authenticate the receipt. The existing local pair inspection and final SFTP readback independently establish the object bindings. Only then can the existing provider-neutral `_validate_confirmation` and canonical evidence publication run.

## Threat model and trust assumptions

The boundary rejects a forged, missing, truncated, replayed, cross-backup, noncanonical, or modified receipt/signature pair; an unpinned, malformed, non-RSA, or non-3072-bit verification key; an insecure trust file; a weakened algorithm; and receipt-only or readback-only success. The SFTP account is not a signing authority and must never receive signing-key access.

A valid signature authenticates the dedicated Windows durability authority under the assumption that the protected Windows host, LocalSystem, and trusted local administrators have not been compromised. It is not hardware attestation and does not attest the identity of one exact PowerShell process. A LocalSystem or trusted-administrator compromise is a Windows host compromise outside this receipt-signature boundary. Storage hardware or firmware must still honor the Windows write-through and flush guarantees used by Task 0072.

## Fixed cryptographic scheme

The persistent CNG machine key has the exact logical name:

```text
YOLPOL-Offserver-Durability-Receipt-v1
```

The helper only opens and validates this key through `Microsoft Software Key Storage Provider`. It never creates or replaces it. The required properties are RSA, 3072 bits, persistent rather than ephemeral, machine-level, signing-only, and non-exportable. The helper separately requires the current Windows identity to be LocalSystem before signing.

The helper also retrieves the persistent key's self-relative `Security Descr` property from its opened NCRYPT handle with `OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION | NCRYPT_SILENT_FLAG`. It never reads or infers permissions from a key-container filesystem path and never changes the descriptor. The owner must be LocalSystem. The DACL must be present, non-null, protected, canonical, and contain exactly two explicit, non-callback, non-inherited, nonzero allow ACEs: one SID-based ACE for LocalSystem and one for BUILTIN\Administrators. Every deny, inherited, object/callback, zero-mask, duplicate, missing, or additional ACE is rejected. This exact-principal contract deliberately does not guess one provider-specific numeric access mask; successful LocalSystem key opening/signing establishes the required operation, while no unapproved SID may receive any access ACE.

The signature uses SHA-256 with RSASSA-PSS. MGF1 is SHA-256 and the PSS salt length is exactly the SHA-256 digest length. A raw RSA-3072 signature is exactly 384 bytes.

The signed message is exactly:

```text
ASCII("YOLPOL-WINDOWS-DURABILITY-RECEIPT-V1")
+ 0x00
+ exact canonical receipt bytes
```

The helper signs the same byte array later published as `<backupId>.json`; it does not parse or reconstruct another JSON value for signing. The Task 0072 receipt schema and one-trailing-LF canonical encoding remain unchanged. No Windows timestamp, algorithm name, key identifier, boolean assertion, or signature is added to the JSON.

The detached raw binary signature is:

```text
E:\yolpol-backups\durability-receipts\<backupId>.sig
/durability-receipts/<backupId>.sig
```

It contains no Base64, JSON, BOM, newline, or metadata.

## Windows validation and publication order

For a new eligible backup, the helper preserves the Task 0072 durable-copy sequence and then performs this exact order:

1. Create exclusive write-through artifact and manifest partials, flush them, publish non-replacing final names, and re-hash the final files.
2. Require `FlushFileBuffers` on the fixed `E:` NTFS volume.
3. Build the exact canonical receipt bytes and fixed domain-separated message.
4. Require LocalSystem, open the fixed persistent CNG machine key, validate its cryptographic properties and native owner/DACL allowlist, sign with RSA-PSS/SHA-256, require 384 bytes, and locally verify the new signature.
5. Create the signature partial with `CREATE_NEW` and write-through semantics, write exactly 384 raw bytes, call `Flush(true)`, and validate its canonical inherited ACL.
6. Create the receipt partial with the existing exclusive write-through primitive, flush it, and validate its canonical inherited ACL.
7. Publish the signature final with the existing no-replace same-volume primitive.
8. Publish the receipt final last with the same no-replace primitive. No fallible per-backup action follows this final commit marker.

The helper has no delete, overwrite, repair, or automatic cleanup path. If signature publication succeeds and receipt publication fails, the orphan remains for manual review. On a later run, receipt-without-signature, signature-without-receipt, partial/final collisions, wrong lengths, unsafe ACLs, an unavailable or nonconforming key security descriptor, a receipt mismatch, or an invalid existing signature all fail closed. A completed pair is accepted only after the durable objects, canonical receipt, signature file, ACLs, fixed key cryptographic and security-descriptor contracts, and signature all validate again.

## VPS verification

The only verification key path is:

```text
/etc/yolpol/offserver-durability/windows-receipt-rsa-v1.pem
```

It must be a non-empty bounded regular `root:root 0600` file in the existing `root:root 0700` trust directory and contain only the pinned SubjectPublicKeyInfo public key. No Production private signing key may exist on the VPS. The configured JSON schema has not gained a key path, algorithm, command, key ID, or verification mode.

The adapter uses only `/usr/bin/openssl`, which must be a regular root-owned executable and not group/world writable. Before the adapter can perform a configured durability operation, and again before signature verification, it directly runs the fixed non-shell preflight `/usr/bin/openssl pkey -pubin -in /etc/yolpol/offserver-durability/windows-receipt-rsa-v1.pem -pubcheck -text_pub -noout` with `LC_ALL=C`, a fixed minimal environment, a fixed timeout, discarded diagnostics, and bounded standard output. OpenSSL's successful public-key check establishes a structurally valid public SubjectPublicKeyInfo; the strict output contract must identify `Public-Key: (3072 bit)`, `Modulus:`, and an exponent line, which rejects wrong algorithms and sizes. Unexpected or oversized output fails closed.

Signature verification is a separate direct `shell=False` call with discarded output and a fixed timeout. Its arguments pin `dgst -sha256`, the fixed public-key path, the downloaded fixed signature path, `rsa_padding_mode:pss`, `rsa_mgf1_md:sha256`, and `rsa_pss_saltlen:digest` against a temporary file containing the exact domain-separated receipt message.

After immutable ingress upload, the adapter polls the fixed `.json` and `.sig` paths derived only from the validated backup ID. A fetched receipt must retain the exact eight-field Task 0072 schema and canonical bytes. The signature must be exactly 384 bytes and verify before the adapter starts final durable-pair readback. The adapter then downloads the two fixed `/durable` objects and checks exact sizes and SHA-256 values. `verified_at_unix` remains the VPS/controller `now_unix`; Windows supplies no trusted time.

Only after all checks pass does the adapter return destination verification, the fixed Windows confirmation, fixed remote object-set identity, and controller verification time. The provider-neutral validator and evidence writer remain unchanged and are not bypassed.

## Replay and cross-backup resistance

The authenticated receipt binds the validated backup ID, artifact hash and size, manifest hash and size, fixed durable confirmation, fixed remote object-set identity, and schema version. A signature for another backup ID, another receipt byte sequence, modified object binding, or noncanonical encoding cannot verify for the active pair. The controller also compares all bindings against its locally inspected fresh pair before evidence publication. No Windows timestamp is needed or trusted.

## Key provisioning, lifecycle, rotation, and compromise

Future activation must be a separately approved live procedure. It must create the named persistent RSA-3072 non-exportable signing-only machine key in Microsoft Software KSP; set LocalSystem as owner; install the exact protected, canonical two-ACE LocalSystem/BUILTIN\Administrators DACL while excluding `yolpol-backup`, BUILTIN\Users, Everyone, Authenticated Users, and every other principal; export only the public key; independently transfer and install that public key at the fixed VPS path; record and compare its fingerprint through an approved channel; and run a controlled challenge/sign/verify acceptance test before configuring the adapter.

Rotation is versioned, explicit, and fail-closed. It must occur with no in-flight Phase C2 backup. A new reviewed authority and fixed public-key contract must be provisioned and accepted before becoming active; there is no silent replacement or dynamic multi-key ring. If compromise is suspected, changed-fingerprint Production operations remain blocked until a new authority is provisioned and accepted. A compromised key is not retained merely for availability.

## Failure and Production ordering

Missing/insecure key material or executables, an unavailable/nonconforming CNG security descriptor, an ephemeral signing key, a malformed/wrong-algorithm/wrong-size public key, absent or invalid signatures, receipt/signature mismatch, any receipt binding error, OpenSSL failure/timeout, durable readback failure, or any provider-neutral evidence rejection produces no canonical evidence. Changed-fingerprint Production remains blocked with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` before journal creation, authority mutation, registry authentication, image pull, database deployment, application/worker replacement, or migration. No Windows or VPS failure path repairs or deletes remote state automatically.

## Remaining activation work and residual risk

Phase C2 still requires live key provisioning, Windows root/ACL/helper/Scheduled Task installation, SFTP key and independently pinned host-key provisioning, Tailscale/firewall validation, VPS public-key installation, configured-adapter activation, native fixed-volume flush acceptance, schedule/maximum-backup timing acceptance, real encrypted backup/signature/readback and restore testing, failure testing, and changed-fingerprint Production-gate acceptance.

The Task 0071 SFTP download-size residual risk remains. The adapter validates exact sizes immediately after each completed receipt, signature, artifact, and manifest download, but system `sftp get` provides no trustworthy pre-transfer maximum. Temporary-filesystem capacity or a separately reviewed containment mechanism must be accepted before live activation.
