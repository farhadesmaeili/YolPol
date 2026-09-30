# Task 0071: Windows SFTP Off-server Durability Adapter

## Status and activation boundary

The fixed transport and destination-readback implementation for `windows-sftp-v1` is complete and synthetically tested. Positive per-backup durable-write confirmation is **not implemented**, so this adapter does not yet satisfy the complete Task 0069 durability contract even when configured. Live activation is **not done**. This task did not access or change the VPS, Windows, Tailscale, GitHub, Production, a real backup, a real credential, or a real host key. The repository still defaults to canonical `{"schemaVersion":1,"state":"unconfigured"}`, and changed-fingerprint Production promotion remains fail-closed with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`.

## Objective and architecture

This adapter implements the fixed SFTP transport and independent destination-readback portions of the provider-neutral Phase C2 contract from Task 0069. It sends only the already validated encrypted Production `BackupPair` through the system OpenSSH SFTP client to a private Windows destination reachable over Tailscale. It does not add a cloud SDK, remote shell, application API, database migration, UI, arbitrary provider framework, or caller-selected transport. SFTP upload completion, file close, and successful readback prove destination integrity at that time; they do not prove that Windows flushed the exact backup pair to durable storage.

The existing sequence remains authoritative:

```text
fixed root controller
-> inspect and checksum the encrypted .dump.age plus manifest
-> select windows-sftp-v1 only from root-owned configuration
-> validate all fixed activation files
-> copy the exact pair through SFTP
-> download both destination objects into root-owned temporary storage
-> compare exact sizes and SHA-256 values
-> stop fail-closed because no positive durable-write confirmation exists
-> publish no canonical Phase C2 evidence
-> permit no controller authority/runtime/migration mutation
```

The provider-neutral `DurabilityContext`, `BackupPair`, `RemoteDurabilityAdapter`, `RemoteDurabilityConfirmation`, evidence validation, and controller ordering remain recognizable and unchanged in responsibility.

## Trust boundary and Windows destination

The intended destination is a dedicated Windows OpenSSH account named `yolpol-backup`, reachable only through a literal Tailscale IPv4 address. The separately provisioned Windows account must be key-only, SFTP-only, non-interactive, chrooted to its dedicated backup root, and denied shell, TTY, TCP forwarding, and agent forwarding. It must be writable only beneath the configured Production backup directory.

This repository does not configure Windows or Tailscale. The Windows `sshd_config`, NTFS ACLs, authorized key restriction, firewall/Tailscale policy, chroot behavior, and service restart require a separate reviewed activation procedure and direct validation on that host.

## Exact configuration contract

The fixed configuration path is `/etc/yolpol/offserver-durability.json`, `root:root 0600`. It accepts exactly one of two canonical schema-version-1 objects.

The default state is:

```json
{"schemaVersion":1,"state":"unconfigured"}
```

The configured state has exactly these fields; this example address is synthetic and is not a live destination:

```json
{"adapter":"windows-sftp-v1","host":"100.100.100.100","port":22,"remoteDirectory":"/production","schemaVersion":1,"state":"configured","username":"yolpol-backup"}
```

Validation is fail-closed:

- JSON must be UTF-8, canonical compact sorted JSON with one trailing newline, at most 4096 bytes, with no BOM, duplicate keys, unknown fields, non-finite values, or type substitutions.
- `schemaVersion` is the JSON integer `1`; `state` is exactly `unconfigured` or `configured`; the only configured adapter is `windows-sftp-v1`.
- `host` is a canonical literal IPv4 address inside Tailscale CGNAT range `100.64.0.0/10`. DNS names, MagicDNS, public addresses, IPv6, and non-canonical literals are rejected.
- `port` is a JSON integer from 1 through 65535; booleans are rejected.
- `username` is exactly `yolpol-backup`.
- `remoteDirectory` is an absolute, bounded SFTP path with one to eight segments using only ASCII letters, digits, `_`, and `-`. Root, relative paths, dot segments, traversal, spaces, backslashes, and trailing slashes are rejected.

No deployment intent or caller can supply these values, an executable, key path, known-hosts path, evidence path, SSH option, command, or URL.

## Fixed secret and trust files

The adapter uses only:

```text
/usr/bin/sftp                                           fixed executable
/etc/yolpol/offserver-durability.json                   root:root 0600
/etc/yolpol/offserver-durability/                       root:root 0700
/etc/yolpol/offserver-durability/id_ed25519             root:root 0600
/etc/yolpol/offserver-durability/known_hosts            root:root 0600
/opt/yolpol/runtime/tmp                                 root:root 0700
```

The private key and pinned host key are not committed, generated, or fabricated. Before use, the adapter rejects missing, empty, oversized, non-regular, symlinked, non-root-owned, wrong-group, or wrong-mode key/trust files. It rejects a missing, non-root-owned, group/world-writable, non-regular, or non-executable `/usr/bin/sftp`. Automatic host-key updates are explicitly disabled with `UpdateHostKeys=no`.

Later activation must generate or provision the client Ed25519 private key through an approved secret channel. The public key is installed for the restricted Windows account. The Windows `ssh_host_ed25519` public-key fingerprint must be compared independently on Windows and the VPS before the approved `[host]:port` or host entry is written to the fixed `known_hosts`. Host-key changes are never accepted automatically.

## OpenSSH process policy

The adapter invokes `/usr/bin/sftp` directly with an argument array, `shell=False`, a minimal environment, suppressed stdout/stderr, and a 120-second process timeout. It disables user/system SSH configuration with `-F none` and fixes all security-relevant options. The enforced policy includes:

- batch input and `BatchMode=yes`;
- `StrictHostKeyChecking=yes`;
- `UpdateHostKeys=no`;
- both user and global known-hosts lookups fixed to the pinned file;
- the fixed Ed25519 identity with `IdentitiesOnly=yes`;
- public-key authentication only, with password, keyboard-interactive, challenge-response, GSSAPI, and password prompts disabled;
- Ed25519 host and client public-key algorithms;
- all forwarding, agent forwarding, X11, local commands, proxy commands/jumps, and TTY requests disabled;
- bounded connection attempts, connect timeout, and server-alive failure detection.

The implementation has no `sshpass`, password path, shell command, raw stdout/stderr publication, or caller-controlled command line. Exceptions cross the controller boundary only as the existing normalized Phase C2 failure.

## Immutable remote object layout and collision behavior

For backup ID `<backupId>`, the fixed object set is:

```text
<remoteDirectory>/<backupId>/
  <backupId>.dump.age
  <backupId>.manifest.json
```

The adapter first copies both validated source objects into a newly created root-owned temporary local directory and rechecks their sizes and SHA-256 values. SFTP then creates the backup-specific remote directory, uploads both files under `.partial` suffixes, and renames them to final names only after both uploads succeed. Creating an already existing directory fails the batch, so an existing complete or partial object set is never reused or overwritten.

A failure can leave an isolated backup-specific directory or `.partial` object on the destination. Such state cannot be mistaken for a verified final pair and makes retry with the same immutable backup ID fail closed. The adapter deliberately has no remote delete, overwrite, cleanup, or retention command.

## Destination verification and missing durable-write proof

After both final renames, a second SFTP batch downloads the exact two final objects into the adapter-owned temporary directory. The adapter requires regular readback files, exact artifact and manifest sizes, and exact SHA-256 matches against the already validated local `BackupPair`. The temporary upload/readback directory is then removed; the source Production backup is never deleted or modified.

Successful destination readback establishes internally that:

- `destination_verified = True`;
- `verification_source = "destination"`;
- the downloaded artifact and manifest exactly match the validated local pair.

Readback alone does **not** establish `durable_write_confirmed = True`. The adapter raises `DurabilityUnavailable` after successful readback because the current fixed SFTP-only path cannot positively observe a bounded fsync-class result for that exact backup pair. It therefore returns no successful `RemoteDurabilityConfirmation`, publishes no canonical evidence, and never emits `durabilityConfirmation = "sftp-destination-readback-v1"`.

OpenSSH SFTP's `fsync@openssh.com` extension and client `-f` behavior are not used as a shortcut. The OpenSSH upload path can discard the direct `sftp_fsync()` result, so the outer process exit status is insufficient proof that remote fsync succeeded. A future implementation requires either a positively verified per-upload fsync-class result or a separately reviewed Windows-side durable-flush receipt/helper exposed through the SFTP-only boundary. It must not add a remote shell, caller-supplied receipt, assertion boolean, or generic command execution.

System `sftp` also offers no trustworthy pre-transfer maximum for `get`. The adapter checks exact expected sizes immediately after each completed download, but a malicious or corrupted destination could send an oversized object first and consume unexpected space under `/opt/yolpol/runtime/tmp`. Parsing remote listings would be race-prone and does not bound transfer bytes. Activation review must treat temporary-filesystem capacity/containment as a residual risk unless a reliable transfer bound is added.

## Failure, rollback, and deactivation

Malformed configuration, insecure files, unavailable SFTP, connection/authentication/host-key failure, collision, upload-batch failure, readback-batch failure, either checksum mismatch, timeout, or successful readback without durable-write confirmation fails before evidence publication. The controller retains `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`; it does not create the deployment journal, activate authority, authenticate to the registry, pull images, deploy the database, replace services, or run the Production migration.

Deactivation is a separately approved root-controlled replacement of the active configuration with canonical `unconfigured`. It does not delete remote objects, local backups, evidence, ledgers, authorities, migrations, or credentials. After deactivation, future changed-fingerprint Production promotion fails closed. Existing evidence remains immutable historical evidence and cannot be rebound to another deployment.

## Bootstrap behavior

Bootstrap now installs/checks `openssh-client`, creates `/etc/yolpol/offserver-durability` as `root:root 0700`, and creates a missing active configuration as canonical unconfigured `root:root 0600`. It continues to install the unconfigured example. It does not create the private key or `known_hosts`, and ordinary bootstrap/check succeeds while the adapter is unconfigured. Activation material is validated only when the configured adapter is selected.

No sudo command or operator permission is added. `yolpol-operator` and the deployment agent receive no direct SFTP, key, trust-file, or arbitrary SSH access; the existing root controller remains the only execution path.

## Tests and explicit deferrals

Synthetic tests cover the default unavailable state, exact configured schema, malformed/duplicate/unknown configuration, unsupported adapters, unsafe hosts/ports/users/directories, missing and insecure key/trust files, strict non-interactive OpenSSH options, absence of password and shell paths, path traversal rejection, collision, upload-batch failure, readback-batch failure, both same-size checksum mismatches, timeout, successful exact readback followed by unavailable durable confirmation, no canonical evidence from readback alone, and the existing controller ordering and same-fingerprint compatibility. Because upload and rename commands share one SFTP batch, tests deliberately do not claim separately observable artifact-upload and manifest-upload failure states. Bootstrap tests cover the fixed directory/config modes, OpenSSH prerequisite, unchanged sudo boundary, and absence of credentials from repository examples.

Still deferred:

- a positive, bounded, per-backup durable-write confirmation primitive;
- live Windows OpenSSH, account, chroot, and NTFS ACL configuration;
- live Tailscale/firewall policy and reachability validation;
- real client-key provisioning and independently verified host-key pinning;
- live VPS contract refresh and configured JSON installation;
- a controlled encrypted Production backup upload/readback exercise;
- Production activation of changed-fingerprint migrations;
- remote partial-object incident cleanup, retention, monitoring, restore automation, and full disposable disaster-recovery proof.
- a reliable pre-transfer readback size bound or separately reviewed containment for `/opt/yolpol/runtime/tmp`.

Repository implementation is not live activation. Configuration and successful destination readback alone still cannot create Task 0069 durability evidence. Until a real durable-write primitive and the remaining prerequisites are separately approved, completed, and verified, Production remains fail-closed.
