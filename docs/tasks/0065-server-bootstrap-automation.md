# Task 0065: Server Bootstrap Automation

## Status

Implemented as a repository-managed Phase B contract and validated locally/disposably. No current VPS, SSH, SCP, Cloudflare, DNS, provider, real secret, database, Production deployment, service activation, commit, or push operation is part of this task.

## Decision

Add one root-only Python standard-library bootstrap at `deploy/bootstrap/yolpol-bootstrap.py`. It installs and verifies the existing deployment architecture rather than creating a second deployment path. The unprivileged `yolpol-operator` still has only `/opt/yolpol/bin/yolpol-deploy` through unchanged sudoers. Bootstrap is never delegated through unattended sudo.

The first supported platform is Debian 12 on `x86_64`. This reflects the current Debian/glibc image and Linux VPS assumptions without claiming arbitrary-distribution support. Bootstrap uses Debian's package manager and Docker's official signed APT repository, verifies the repository key fingerprint, and requires the Compose plugin at `/usr/libexec/docker/cli-plugins/docker-compose`.

## Stages

The fixed workflow performs:

1. root, operating-system, version, and architecture validation;
2. Python/ACL/curl/CA/GnuPG/sudo and official Docker Engine/Compose installation or verification;
3. exact `yolpol-operator` UID/GID verification or creation, complete supplementary-group/Docker-socket exclusion, exact-wrapper-only effective sudo proof, and container UID/GID non-allocation;
4. idempotent fixed `/opt/yolpol` hierarchy and non-truncating log/state creation;
5. allow-listed atomic installation of wrapper, policy, sudoers, logrotate, Staging, Production, shared ingress, and Monitoring contracts;
6. sudoers validation before and after installation;
7. inspect-or-create handling for the two fixed external ingress networks;
8. closed-schema runtime installation;
9. closed-schema stdin-only application/Monitoring secret installation with explicit rotation commands;
10. failure-safe pair promotion of an independently authenticated release into one selected environment authority over file descriptors 3 and 4;
11. a non-mutating foundation `check` plus separate Staging, Production, ingress, and Monitoring readiness commands.

`apply` refuses differing installed managed bytes. `refresh-contracts` is the explicit reviewed-content update path. Both are source-only commands that run exclusively from `/root/yolpol-bootstrap-source`; the installed binary rejects them. All sources, sudoers syntax, and existing destination metadata are preflighted before the first managed replacement. Predictable validation failures therefore produce no partial refresh, while each subsequent file replacement is individually atomic. The workflow does not claim a globally crash-atomic multi-file transaction across an operating-system or power failure. Neither command repairs incompatible ownership, modes, symlinks, ancestors, or ACLs silently. Repeated application to correct state succeeds without destructive mutation.

## Security preservation

Sudoers remains byte-for-byte unchanged and grants neither bootstrap nor Docker. The bootstrap accepts no caller-selected source, destination, Compose project/file, Docker endpoint, service, image, network name, or arbitrary command. Initial source authentication is an honest manual root step; source commands then require the fixed root-owned, mode-`0700`, non-writable, non-symlinked, ACL-free boundary. It rejects privileged operator groups, broader effective host sudo, unknown runtime/secret keys, duplicate JSON keys, unsupported hosts, incompatible existing networks, and non-root execution.

UID/GID `10001:10001` remains container-only. Secrets use the exact established host ownership: root-owned database environment files, `10001:10001` first-party secret files, and `65534:65534` upstream Monitoring secret files. Secret values are never arguments or environment variables, never logged, and never written to runtime or release artifacts. First installation allows exact retry only; replacement requires an explicit rotation command.

The release checksum is explicitly treated as integrity evidence, not authentication. Root or future approved automation must independently authenticate and select the release before promotion. A validated two-file authority is staged and fsynced, then its directory is atomically exchanged with `active`; the old valid pair is retained. Staging and Production have separate commands and fixed active directories; no Staging-to-Production copy exists.

Raw whitespace, `$`, `#`, backslash, and quotes are rejected in Compose env-file secret values; URL percent encoding is the supported representation. Recovery database credentials and the backup age identity are deferred to a later explicit recovery workflow and are not a bootstrap readiness prerequisite.

## Activation boundary

Bootstrap creates no application/database/Monitoring volumes and starts no Compose service. It does not run migrations, pull/deploy release images, register Telegram, start shared ingress, activate Monitoring, expose Production, modify Cloudflare/DNS, request certificates, remove the legacy Staging rollback edge/network, or clean up backups/releases/data.

Phase C remains responsible for authenticated release retrieval, automatic Staging deployment, health/readiness/smoke gates, Production approval, exact same-digest promotion, migration/backup gates, and deployment records. Phase D remains responsible for actual disposable rebuild and backup-recovery proof.

Task 0066 later extended this bootstrap inventory with an isolated deployment-agent account, control-plane contracts, systemd units, strict credential-path metadata, ledger/journal directories, and an exact two-command agent sudo rule. The extension does not enable/start the timer or generate credentials; the original Phase B activation boundary remains intact.

## Validation

The focused Vitest contract covers supported-host assumptions, closed grammar, fixed installation inventory, secret/runtime/release separation, unchanged sudoers, fixed networks, actual Docker Compose env-file parsing, and absence of activation/destructive surfaces. The disposable Debian test covers root enforcement, command grammar, fixed source ownership/mode/symlink rejection, directory convergence, base-versus-Production readiness, release-pair failure injection, privileged-group/broad-sudo rejection, recovery-secret absence, repeated apply, exact modes, closed runtime schema, secret no-log behavior, explicit rotation, incompatible network rejection, and release-authority separation. Existing deployment policy/adversarial tests continue to validate the installed wrapper contract.

## Documentation

The complete operator-facing contract, JSON key inventories, file-descriptor release interface, rebuild order, future GitHub Environment handoff, and deferred work are documented in `deploy/bootstrap/README.md`. The authoritative host hierarchy and restricted deployment surface remain in `deploy/operations/README.md`.
