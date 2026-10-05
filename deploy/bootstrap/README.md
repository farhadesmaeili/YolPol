# YOLPOL Server Bootstrap Automation

This directory implements Phase B server bootstrap, the Task 0067 supported-host expansion, the narrow Task 0066 authenticated-control-plane installation, the Task 0069 root-owned Phase C2 module/evidence foundation, and the non-activating Task 0071 Windows SFTP filesystem/prerequisite contract. It converts one supported clean host into the fixed YOLPOL host foundation and installs the reviewed repository contracts. It is root-only and deliberately separate from `/opt/yolpol/bin/yolpol-deploy`, the narrow unattended command surface. Task 0072 adds a repository-only Windows durable-write helper/receipt contract, Task 0073 adds repository-only detached receipt signing/verification, and Task 0074 requires fixed `/usr/bin/prlimit` from `util-linux` for VPS-side readback containment, without making the Windows helper a Linux bootstrap dependency. The Phase C1 control plane has since been activated separately on the current VPS; Phase C2 lacks live Windows installation/ACL validation, adapter configuration, signing/SFTP keys, pinned host/public-key trust, and destination activation.

Bootstrap does not deploy a release, start Compose services, run migrations, restore a database, upload a backup, configure Windows or Tailscale, provision an SFTP key or pinned host key, activate remote durability, activate Production, alter DNS or Cloudflare, request certificates, register a Telegram webhook, remove legacy rollback state, generate credentials, or enable/start the deployment timer. Release authentication and routine promotion are implemented separately by the now-active Phase C1 control-plane contract.

## Supported host

The supported-host contract is an explicit allow-list and is intentionally narrow:

- Debian 12 (`bookworm`) with Docker's official `https://download.docker.com/linux/debian` repository
- Ubuntu 24.04 LTS (`noble`) with Docker's official `https://download.docker.com/linux/ubuntu` repository
- Linux `x86_64` / Docker `amd64`
- a root session for every bootstrap command
- systemd when Docker must be enabled
- outbound HTTPS access to the operating-system and Docker official authenticated APT repositories during prerequisite installation

Any other distribution, release, codename, or architecture fails closed; `ID_LIKE` does not grant support. The implementation installs Python 3, ACL tools, curl, CA certificates, GnuPG, sudo, Docker Engine, Buildx, and Docker Compose from the Docker repository fixed by the matched host contract. It does not derive the repository or suite from arbitrary host metadata. It verifies the existing Docker signing-key fingerprint and preserves the required Compose executable path:

```text
/usr/libexec/docker/cli-plugins/docker-compose
```

On the live VPS, the trusted source was established manually and the pre-Task-0067 `apply` command was attempted. Source validation passed, but the command failed closed at `validate_supported_host()` because that contract supported only Debian 12 while the VPS runs Ubuntu 24.04/noble. It did not proceed into prerequisite, user, directory, or managed-contract installation. After Task 0067 added the exact Ubuntu 24.04/noble contract, the updated bootstrap was successfully applied and converged; `/opt/yolpol/bin/yolpol-bootstrap check` now reports `yolpol-bootstrap: foundation is ready`.

## Trust boundary

The bootstrap cannot authenticate its own bytes after root has already executed it. Initial trust establishment is therefore an explicit manual root procedure, not a feature of the script:

1. Independently identify and authenticate the approved repository revision or release bundle, including its full commit identity, before it reaches the host trust boundary.
2. Transfer or extract those exact bytes into `/root/yolpol-bootstrap-source` using a root-controlled session and a root-only temporary location. Reject archives with absolute paths, traversal entries, or symlinks before extraction.
3. Make `/root` and `/root/yolpol-bootstrap-source` root-owned mode `0700`. Every source descendant used by bootstrap must be root-owned, must not be group/world writable, must not be a symlink, and must have no extended/default POSIX ACL. The source must not be a checkout or directory writable by `yolpol-operator` or any other unprivileged account.
4. Only then execute the fixed `/root/yolpol-bootstrap-source/deploy/bootstrap/yolpol-bootstrap.py` path.

There is no arbitrary source-path option. `apply` and `refresh-contracts` revalidate the fixed root-only source tree and read allow-listed files with no-follow descriptors before installing them. They never install contracts directly from an operator checkout. The installed `/opt/yolpol/bin/yolpol-bootstrap` deliberately cannot apply or refresh repository contracts.

The normal operator remains UID/GID `1001:1001`, has no supplementary groups, has no Docker-socket access, and has no sudo beyond the exact wrapper command. Effective `sudo -l -U yolpol-operator` output is checked so a conflicting host-level grant fails closed. UID/GID `10001:10001` remains container-only and must not identify a host user or group. Bootstrap is not added to sudoers. The operator grant remains:

```text
/opt/yolpol/bin/yolpol-deploy
```

Task 0066 adds the isolated non-login `yolpol-deployment-agent` UID/GID `1002:1002`. It has no supplementary groups or Docker access and may invoke only `yolpol-deploy apply-staging-intent` and `yolpol-deploy apply-production-intent`. Task 0069 adds `/opt/yolpol/runtime/offserver-durability-evidence` as `root:root 0700` and the root-only durability module. Task 0071 adds `/etc/yolpol/offserver-durability` as `root:root 0700`, creates a missing `/etc/yolpol/offserver-durability.json` as canonical `unconfigured` `root:root 0600`, retains the non-activating example, and installs/checks `/usr/bin/sftp` through `openssh-client`. Task 0072 changes no Linux package or bootstrap destination; its Windows helper remains source-only pending separate Windows activation. Task 0073 reuses the existing `/usr/bin/openssl` prerequisite and fixed trust directory. Task 0074 installs/checks `util-linux` and `/usr/bin/prlimit`. Bootstrap does not create `id_ed25519`, `known_hosts`, or `windows-receipt-rsa-v1.pem`; all three activation files remain separately provisioned. It adds no sudo command, provider credential, private signing key, or operator-writable path. See `deploy/control-plane/README.md` and Tasks 0071 through 0074.

## Commands

All commands have a closed grammar and accept no caller-selected destination, Compose file, Docker endpoint, service, network, or command.

```text
/root/yolpol-bootstrap-source/deploy/bootstrap/yolpol-bootstrap.py apply
/root/yolpol-bootstrap-source/deploy/bootstrap/yolpol-bootstrap.py refresh-contracts

/opt/yolpol/bin/yolpol-bootstrap check
/opt/yolpol/bin/yolpol-bootstrap check-staging
/opt/yolpol/bin/yolpol-bootstrap check-production
/opt/yolpol/bin/yolpol-bootstrap check-ingress
/opt/yolpol/bin/yolpol-bootstrap check-monitoring
/opt/yolpol/bin/yolpol-bootstrap runtime-install <staging|production|ingress|monitoring>
/opt/yolpol/bin/yolpol-bootstrap secret-install <staging|production|monitoring>
/opt/yolpol/bin/yolpol-bootstrap secret-rotate <staging|production|monitoring>
/opt/yolpol/bin/yolpol-bootstrap release-promote <staging|production>
```

`apply` installs missing prerequisites, creates or verifies the operator and fixed filesystem hierarchy, creates empty state/log files without truncating existing files, installs repository contracts, validates sudoers before and after promotion, and inspects or creates the two fixed bridge networks. Before the first managed destination changes, it validates every source, validates the sudoers source, and preflights every existing managed destination. If any existing managed file differs, normal `apply` stops before creating or replacing another managed file. `refresh-contracts` permits differing reviewed bytes, but still rejects incompatible ownership, modes, symlinks, ACLs, ancestors, or destination parents before its first replacement.

For Production promotion, the canonical workflow dispatch branch is `main`. The branch-bound host contract remains independent from Release authority: only authenticated published Release artifacts that satisfy the exact tag, commit, manifest, and immutable-image validations are deployable. `refresh-contracts` can update the managed `/etc/yolpol/control-plane/agent.json.example`, but it does not replace the activation-time `/etc/yolpol/control-plane/agent.json`. Migrating an active host therefore requires an explicit, reviewed, root-controlled update of the Production trust values to exact `refs/heads/main`, coordinated with a GitHub Production Environment rule whose final allowed branch is `main`. Do not temporarily trust both branches; complete and verify the fail-closed cutover as a controlled operation.

`check` is the non-mutating foundation gate. It validates host identity, executables, operator isolation and exact sudo surface, filesystem metadata and ACLs, installed contracts, sudoers, fixed Docker networks, and bootstrap state. It does not require any environment runtime, secrets, or release authority, so Phase B can be ready while Production is intentionally unprovisioned.

The four named readiness commands first run the foundation gate and then validate only their fixed environment's deployment policy and resolved Compose model. For example, `check-production` fails until Production runtime, secrets, and release authority are present, without changing the result of base `check`. Staging and Production remain independent.

## Bootstrap sequence

After the manual trust-establishment procedure above:

```sh
sudo /usr/bin/python3 /root/yolpol-bootstrap-source/deploy/bootstrap/yolpol-bootstrap.py apply
```

Then use the installed root-only command to install independently approved inputs. A typical sequence is:

1. Promote an independently authenticated release to Staging.
2. Install the matching Staging runtime file.
3. Install Staging secrets.
4. Install Monitoring runtime and secrets using the Staging release's Operations Metrics image.
5. Install the fixed ingress runtime.
6. Run base `check`, then the applicable `check-staging`, `check-ingress`, and `check-monitoring` gates.
7. Prove foundation convergence by running source-only `apply` again from the same authenticated fixed source followed by base `check`.
8. When provisioning Production, separately promote an authenticated Production release, install Production runtime and secrets, and run `check-production` after explicit approval.

The sequence prepares host state only. Root-controlled ingress/Monitoring activation and enabling the installed release-deployment timer remain separate reviewed procedures. Repository records establish bootstrap convergence, deployment-timer activation, and the later `v0.2.3` Production Monitoring activation milestone; this bootstrap document does not infer the currently deployed release.

## Runtime installation

Runtime configuration is non-secret and arrives on standard input, never as command arguments. Each input must contain exactly the existing closed schema from the matching `runtime.env.example`. Staging and Production image/revision values must match that environment's active release manifest. Monitoring must match the Staging manifest. Ingress accepts only its four fixed values.

```sh
sudo /opt/yolpol/bin/yolpol-bootstrap runtime-install staging \
  < /root/yolpol-input/staging-runtime.env
```

Unknown, duplicate, empty, control-bearing, `COMPOSE_*`, and `DOCKER_*` keys are rejected. Production is never derived from Staging.

## Secret installation and rotation

Secrets arrive as a versioned JSON document on standard input. Do not put the document or any value in arguments, environment variables, shell history, logs, `runtime.env`, manifests, images, or Git. Future automation should create its input in a root-only temporary directory with `umask 077`, redirect it to stdin, and remove it in a guaranteed cleanup trap.

The document has exactly:

```json
{
  "schemaVersion": 1,
  "environment": "staging",
  "secrets": {}
}
```

The empty object above is illustrative only and is rejected. Required application keys for both Staging and Production are:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
APP_DATABASE_URL
MIGRATION_DATABASE_URL
BACKUP_DATABASE_URL
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
GROQ_API_KEY
```

Production additionally requires `INDEXNOW_KEY`. It is validated as 8-128 ASCII letters, digits, or hyphens and installed only as `/opt/yolpol/production/secrets/indexnow-key` (`10001:10001`, mode `0400`). The Staging secret schema rejects this key and never installs or receives the Production verification value.

Monitoring uses an independent schema:

```text
ALERT_TELEGRAM_BOT_TOKEN
ALERT_TELEGRAM_CHAT_ID
STAGING_POSTGRES_EXPORTER_URI
STAGING_POSTGRES_EXPORTER_USER
STAGING_POSTGRES_EXPORTER_PASSWORD
STAGING_OPERATIONS_DATABASE_URL
PRODUCTION_POSTGRES_EXPORTER_URI
PRODUCTION_POSTGRES_EXPORTER_USER
PRODUCTION_POSTGRES_EXPORTER_PASSWORD
PRODUCTION_OPERATIONS_DATABASE_URL
```

The four Production values are mandatory for a Monitoring secret installation and are written only to the corresponding `production-*` files. They must not reuse Staging credentials. PostgreSQL Exporter files are `65534:65534 0400`; Operations Exporter URL files are `10001:10001 0400`; the containing Monitoring secrets directory remains `root:root 0700`.

`secret-install` is safe for first installation and an exact-value retry. It refuses any non-matching existing secret. Intentional replacement requires `secret-rotate`. Inputs are validated completely before any file is written. Each file is atomically promoted at its fixed destination with the existing owner/mode contract, and internal temporary files are always removed. Errors are generic and never echo values.

For `KEY=value` database files, raw whitespace, `$`, `#`, backslash, and quotes are rejected because Compose env-file interpretation is not an opaque byte transport. Percent-encode those characters in URL user-info/query components. `=` remains accepted, including in query values. Disposable tests resolve the rendered file through actual Docker Compose: the supported percent-encoded URL round-trips exactly, while raw `$NAME` and space-prefixed `#` demonstrate value-changing expansion/comment behavior.

Staging and Production never share a schema invocation, destination, database URL, Telegram credential, Groq key, IndexNow key, or runtime file.

Recovery credentials and the backup age identity are deferred to a later explicit recovery workflow. Phase B has no recovery-secret install/rotate commands, persists no recovery identity as a normal prerequisite, and base/environment readiness does not require recovery material. Bootstrap neither deletes pre-existing recovery files nor claims secure erasure.

## Authenticated release authority

`release-promote` reads the manifest from file descriptor 3 and checksum from file descriptor 4. Paths and bytes are not arguments:

```sh
sudo /opt/yolpol/bin/yolpol-bootstrap release-promote staging \
  3< /root/yolpol-input/release-manifest.json \
  4< /root/yolpol-input/release-manifest.sha256
```

The command validates the same strict manifest/checksum contract as the deployment policy and promotes only to the explicitly selected authority:

```text
/opt/yolpol/releases/staging/active/
/opt/yolpol/releases/production/active/
```

Both inputs are fully validated before active authority changes. The new pair is written as root-owned mode `0600` files inside a root-only staging directory on the same filesystem, each file and directory state is flushed, and Linux `renameat2(RENAME_EXCHANGE)` atomically swaps the complete directory with `active`. The former valid pair is then retained in a timestamped `previous-*` directory. If a failure occurs before the exchange, the old pair remains active; if it occurs after the exchange, the new complete pair is active. A mixed old/new pair is never exposed.

The checksum detects corruption but does not authenticate an attacker-controlled manifest. Before invoking this command, root or future approved automation must independently select and authenticate the GitHub release, verify its repository/tag/full commit, and then provide the two exact assets over the controlled file descriptors. Staging authority is never copied implicitly into Production.

## Fixed networks

Bootstrap recognizes only:

```text
yolpol-staging-ingress
yolpol-production-ingress
```

Each must be a local, non-internal, non-attachable Docker bridge. Missing networks are created idempotently. An existing network with an incompatible name, driver, scope, internal flag, attachable flag, or config-only flag causes failure. Bootstrap never deletes or recreates a network automatically.

## Filesystem and idempotency

The authoritative hierarchy, owners, and modes remain in `deploy/operations/README.md`. Bootstrap creates only missing directories and state files. Existing logs, backup throttle state, backups, releases, secrets, databases, Docker volumes, and networks are never truncated or deleted. Trusted symlinks, non-root/group/world-writable ancestors, incompatible metadata, and extended/default ACLs fail closed.

Predictable source, sudoers, destination-metadata, and normal-apply content failures occur during preflight before managed-file mutation. Each managed file is then staged in its destination directory, flushed, assigned its final owner/mode, and atomically renamed. Re-running against correct state is a no-op, and a failed staged write is cleaned up. A multi-file `refresh-contracts` operation is not claimed to be globally crash-atomic: an operating-system or power failure between otherwise atomic individual replacements can leave a partially refreshed contract set, which must be reconciled by rerunning the same reviewed refresh.

## Future GitHub Environment integration

Phase C may call the installed host-side interfaces without coupling the application to GitHub:

```text
GitHub Environment: staging
-> Staging environment secrets
-> future controlled transport
-> root-only secret-install staging
-> /opt/yolpol/staging/secrets/*
-> Docker file/secret contract

GitHub Environment: production
-> required Production approval
-> Production environment secrets become available
-> future controlled transport
-> root-only secret-install production
-> /opt/yolpol/production/secrets/*
-> Docker file/secret contract
```

That future workflow must avoid command arguments and process environment for secret values, use restrictive temporary files or file descriptors, authenticate release assets independently, and guarantee cleanup. This task does not create GitHub Environments or implement release download/deployment.

## Rebuild and deferred activation

For a disposable rebuild, start from a supported YOLPOL host—currently Debian 12/bookworm `x86_64` or Ubuntu 24.04/noble `x86_64`—establish the fixed trusted source manually, run `apply`, and pass base `check`. Install authenticated release/runtime/secret inputs only for each environment in scope and run its named readiness check. Repeat source-only `apply` plus base `check` to prove foundation convergence. The disposable repository validation image remains Debian-based; Ubuntu selection is covered deterministically by mocked host-validation and repository-rendering tests. Actual backup restore and end-to-end disaster-recovery proof remain Phase D.

Service startup, shared-ingress listener handoff, Monitoring activation, database initialization/migrations, release health gates, Production approval/promotion, Cloudflare redirect removal, DNS cutover, certificate behavior, Telegram registration, legacy rollback cleanup, and live activation of the Production Monitoring repository contract are intentionally not automated here.
