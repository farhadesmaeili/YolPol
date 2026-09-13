# Task 0061: Production Deployment Hardening

## Status

Implemented and validated as a repository-only hardening change. No VPS connection, package installation, sudoers installation, firewall change, Docker service operation, image publication, deployment, migration, database write, credential operation, Docker volume operation, Git commit, push, merge, tag, or protected-stash change is part of this task.

## Decision

Separate first-party container processes from the real VPS operator by moving every YOLPOL runtime to the fixed non-login UID/GID `10001:10001`. Do not create a matching host login. Keep the host deployment control plane root-owned and expose only one audited, fail-closed wrapper through a single narrow sudoers rule.

## Runtime identity

The web, worker, migration, backup/restore, and Operations Metrics images all remain non-root. Debian stages create the `yolpol` account with `/usr/sbin/nologin`; the Alpine operations stage uses `/sbin/nologin`. The web runtime's only application-owned writable path, `.next/cache`, moves with that account. Application artifacts remain root-owned. No Compose capability, privilege, socket mount, or broad writable path is added to first-party services.

The fixed number avoids root, the real `yolpol-operator` UID/GID 1001, and the normal first interactive-user range. Linux Compose file secrets retain numeric host ownership, so first-party mounted secrets and the backup directory use 10001 under a root-only parent. Root-run Compose consumes database env files directly, so those remain root-only. Monitoring's upstream UID 65534 contract remains separate.

## Restricted operations

`deploy/operations/yolpol-deploy` owns the small operator surface: validate, status, health, pull approved images, fixed database startup, explicit migration, fixed app/worker/edge deployment, encrypted backup creation, and identity-free verification of one validated Staging backup ID. Monitoring activation was removed from the operator surface because cAdvisor's Docker socket bind is root-equivalent; the root runbook enumerates all seven services explicitly.

The shell wrapper rejects unknown commands and extra arguments before privileged work; uses fixed `/opt/yolpol` paths, absolute executables, an isolated Python invocation, and an empty Docker/Compose environment; validates trusted ancestors, symlinks, ownership/modes, and ACLs; serializes state-changing operations with `flock`; performs audit preflight and durable final records; rate/space-limits backup creation; and hides sensitive subprocess output in a rotated root-only log. The standard-library Python helper strictly parses runtime files and the active release manifest, then validates resolved Compose JSON rather than source text. It never accepts caller-selected paths, Compose files, environment files, images, services, environment values, or container commands.

Restore, deep verification, retention deletion, arbitrary logs, shell/exec access, secret rotation, firewall control, Docker daemon configuration, database administration, and systemd control remain interactive-root operations. `sudoers.yolpol-deploy` grants `yolpol-operator` `NOPASSWD` access only to the exact root-owned wrapper and documents mandatory `root:root` mode 0440 plus `visudo -cf` validation.

## Host contract

`deploy/operations/README.md` is authoritative for `/opt/yolpol`. Staging and Monitoring use fixed project directories below that root, and their promoted Compose definitions are image-only so the host needs no source checkout or Dockerfile. The only operator-writable path is `/opt/yolpol/incoming`, which accepts non-secret candidates but is never consumed by sudo or the wrapper. Root obtains release assets from an independently selected authenticated GitHub Release, verifies the strict manifest/checksum/source/full commit, and promotes approved bytes into non-operator-writable trusted paths. A checksum supplied with an operator-controlled upload is not treated as authentication. Locks, throttle state, durable audits, protected operation output, and log rotation live under root-only control.

Root SSH remains a separate recovery/bootstrap path. Docker group and socket access remain prohibited for `yolpol-operator`. Firewall work, real secret creation, database role provisioning, backup scheduling/off-server durability, DNS/TLS, Telegram activation, and Production Compose remain later server operations.

## Validation contract

`tooling/deployment/production-deployment-hardening.test.ts` verifies all five first-party runtime users, shell syntax, malicious wrapper arguments, fixed paths/environment, the reduced command surface, protected output, and exact sudoers semantics. It runs the behavioral Python adversarial suite for runtime/manifest/model parsing and, where Docker Compose is available, validates real resolved Staging and Monitoring JSON plus privilege, extra-service, public-port, and writable-socket mutations. Target-host installation still requires `visudo`, Linux filesystem/ACL tests, and built-image `Config.User` checks.
