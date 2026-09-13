# YOLPOL Restricted Deployment Operations

This directory defines a repository-side contract for a future VPS. Nothing here installs sudoers, contacts a server, changes Docker, creates credentials, runs migrations, or deploys containers.

## Security boundary

`yolpol-operator` remains an unprivileged SSH account. It must not be in the `docker` group, read `/var/run/docker.sock`, receive unrestricted sudo, or own any trusted deployment path. Root SSH remains the separate bootstrap, Monitoring, recovery, retention, and emergency path.

The only unattended sudo grant is the root-owned `/opt/yolpol/bin/yolpol-deploy` wrapper. A sudoers command specification with only an executable pathname permits arbitrary arguments to that executable. Safety therefore comes from the wrapper's closed argument grammar: it rejects every unknown command, missing argument, extra argument, and malformed backup identifier before executing an operation. Do not add sudoers argument wildcards or another command.

The wrapper and standard-library Python policy helper:

- use fixed absolute paths, a fixed Compose plugin, fixed project names, and an `env -i` execution environment;
- accept no caller-selected file, directory, image, environment, service, mount, command, or Docker endpoint;
- validate the authenticated root-promoted release manifest and checksum, full revision, exact first-party repositories, and digest-only image references;
- parse both runtime files as closed schemas, rejecting duplicate, missing, unknown, control-bearing, `COMPOSE_*`, and `DOCKER_*` entries;
- validate resolved `docker compose config --format json`, including exact services, commands, profiles, builds, images, environments, mounts, secrets, networks, published ports, and top-level resources;
- reject privilege, device, capability, host-network, unexpected host-PID, namespace, inherited-volume, configuration, and unexpected service-key additions;
- validate every trusted leaf and ancestor for type, symlink absence, numeric owner/group, mode, and absence of extended/default ACLs;
- serialize mutating operations with a root-only `flock` file and write started/final audit records durably;
- keep migration and backup program output in a rotated root-only operation log so credentials or provider errors cannot reach the operator terminal.

## Operator command surface

| Command | Fixed behavior |
| --- | --- |
| `validate` | Validate trusted host paths, release/runtime contracts, and both resolved Compose models. |
| `status` | Show `compose ps` for the two fixed projects; no application logs. |
| `health` | Check the five fixed Staging services and the code-owned web readiness request. |
| `pull-approved-images` | Pull only the images in the two validated resolved models. |
| `deploy-database` | Start/update only Staging PostgreSQL, with `--no-build --no-deps`. |
| `migrate` | Run only the fixed migration service, non-interactively and with `--no-build --no-deps`. |
| `deploy-app` | Start/update only the Staging web service. |
| `deploy-workers` | Start/update only the three named Staging workers. |
| `deploy-edge` | Start/update only the Staging Caddy service. |
| `backup-create` | Run the fixed encrypted backup service after a 5 GiB free-space floor and 15-minute success throttle. |
| `backup-verify <backup-id>` | Run identity-free verification for one strict ASCII Staging backup identifier. |

There is deliberately no operator `deploy-monitoring` command. Restore, deep verification with the recovery identity, backup retention/deletion, arbitrary logs, shell/exec, systemctl, firewall, secret rotation, Docker administration, and database administration remain unavailable.

## Runtime and release authority

`deploy/staging/runtime.env.example` and `deploy/monitoring/runtime.env.example` enumerate the complete runtime schemas. The Staging schema contains one full 40-character lowercase Git SHA; four fixed YOLPOL repository digest references; fixed host paths, ports, resource/logging limits, retention values, and deployment settings; one public age recipient; and one public Telegram username. Monitoring contains the fifth fixed repository digest reference plus fixed loopback ports, config/secret paths, external network names, resource/logging limits, and disabled-by-default backup monitoring. No additional key is supported.

The active authority is exactly:

```text
/opt/yolpol/releases/active/release-manifest.json
/opt/yolpol/releases/active/release-manifest.sha256
```

Both files are root-owned, mode `0600`, non-symlinks beneath root-only ancestors. The helper duplicates the repository release contract: fixed source repository, version/tag/full SHA/platform/database fingerprint, exactly five roles and targets, exact repositories, digest syntax, and internally consistent immutable refs. Staging and Monitoring runtime values must match that same manifest.

The SHA-256 sidecar detects corruption but is not an authenticity mechanism when supplied beside attacker-controlled bytes. Root must obtain the release assets over an authenticated channel from the independently selected release at `farhadesmaeili/YolPol`, run `pnpm release:manifest:verify`, compare the tag/source/full commit to the approved release record, and only then promote both files from a root-controlled location. Never authenticate an operator upload with a checksum uploaded by that same operator.

## Host identity and filesystem contract

Every first-party runtime uses non-login UID/GID `10001:10001`. Confirm both numbers are unused on the host; do not create a matching host login. The operator remains `1001:1001`. Linux file-backed secrets for first-party containers use `10001:10001` mode `0400`; database env files remain root-only; the backup directory is `10001:10001` mode `0700`. Upstream Monitoring secrets retain their documented `65534:65534` ownership.

```text
/opt/yolpol/                                      root:root 0755
  bin/                                             root:root 0755
    yolpol-deploy                                  root:root 0755
    yolpol-deploy-policy                           root:root 0555
  incoming/                                        1001:1001 0700
  releases/                                        root:root 0700
    active/                                        root:root 0700
      release-manifest.json                        root:root 0600
      release-manifest.sha256                      root:root 0600
  runtime/                                         root:root 0700
    tmp/                                           root:root 0700
    deployment.lock                                root:root 0600
    deployment-audit.log                           root:root 0600
    deployment-operation.log                       root:root 0600
    last-backup-created-at                          root:root 0600
  staging/                                         root:root 0750
    compose.yaml, Caddyfile                         root:root 0644
    runtime.env                                     root:root 0600
    secrets/                                        root:root 0700
      postgres.env, *-database.env                  root:root 0400
      telegram-*, groq-api-key                      10001:10001 0400
    backups/                                        10001:10001 0700
  monitoring/                                      root:root 0750
    compose.yaml                                    root:root 0644
    runtime.env                                     root:root 0600
    prometheus/, alertmanager/, blackbox/            root:root 0755
    secrets/                                        root:root 0700
      alert-telegram-*, staging-postgres-exporter-* 65534:65534 0400
      staging-operations-database-url               10001:10001 0400
```

`incoming/` is the only operator-writable path. The wrapper never reads it. Root promotion must copy reviewed bytes into a root-controlled temporary path, set final ownership/modes, and atomically place them below the trusted tree. All listed paths and the fixed system executable chain are checked with shell type predicates, `readlink -f`, `stat`, and `getfacl`; symlinks, writable ancestors, named ACL entries, ACL masks, and default ACLs fail closed. Because no checked ancestor is operator-writable, validation-to-execution races are outside the attacker model.

## Audit and resource controls

Create both logs and state files before enabling sudo. Every valid invocation must append a `started` record before work and a final success/failure record; rejected sudo invocations append `denied`. Records contain only UTC timestamp, sanitized sudo actor, fixed action, validated-or-unknown revision, validated backup ID or `none`, result, and exit code. `sync -f` makes each append durable. A failed audit preflight prevents the operation.

Install `logrotate.yolpol-deploy` as `/etc/logrotate.d/yolpol-deploy`, `root:root 0644`. It rotates both root-only logs weekly or at 10 MiB, retains 13 compressed generations, and creates replacements as `0600 root:root`. The operation log may contain sensitive subprocess diagnostics and is never exposed through the wrapper.

Backup creation additionally requires at least 5 GiB available in the fixed backup filesystem and at least 900 seconds since the last successful wrapper-created backup. Compose memory, CPU, PID, read-only-root, tmpfs, and capability controls remain validated. Scheduling, remote durability, and destructive retention are separate root decisions.

## Monitoring and local access

Prometheus and Alertmanager bind only `127.0.0.1`. This prevents network exposure but does not authenticate them: any local host account able to connect to loopback can reach those UIs. Keep host accounts trusted and minimal. Remote access remains disabled while SSH TCP forwarding is disabled; do not publish or proxy these ports without a separately reviewed authenticated design.

cAdvisor's read-only Docker socket bind is still Docker-API access and must be treated as root-equivalent. Consequently Monitoring activation is root-only. After `/opt/yolpol/bin/yolpol-deploy validate` succeeds, root may run exactly:

```sh
/usr/bin/env -i \
  PATH=/usr/sbin:/usr/bin:/sbin:/bin HOME=/root DOCKER_CONFIG=/root/.docker \
  TMPDIR=/opt/yolpol/runtime/tmp LC_ALL=C \
  /usr/libexec/docker/cli-plugins/docker-compose --ansi never \
  -p yolpol-monitoring \
  --project-directory /opt/yolpol/monitoring \
  --env-file /opt/yolpol/monitoring/runtime.env \
  -f /opt/yolpol/monitoring/compose.yaml \
  up -d --no-build --no-deps \
  prometheus alertmanager node-exporter cadvisor postgres-exporter blackbox-exporter operations-exporter
```

Never use an implicit whole-project `up`, add another service without updating the policy, or delegate this root procedure to `yolpol-operator`.

## Installation gate for a later root session

1. Confirm the operator is exactly UID/GID 1001, UID/GID 10001 are unused, and the operator has neither Docker group nor socket access.
2. Install Python 3, `acl`/`getfacl`, Docker Engine, and the Compose plugin at the fixed `/usr/libexec/docker/cli-plugins/docker-compose` path. Confirm every executable and ancestor matches the wrapper contract.
3. Create the hierarchy and empty state/log files above without truncating existing audit history. Create `/root/.docker/config.json` as `root:root 0600`; do not expose its contents.
4. Authenticate and verify the release outside the operator upload path, then root-promote the manifest/checksum, Compose/config files, closed runtime files, and secrets.
5. Install `yolpol-deploy`, `yolpol-deploy-policy.py` as `/opt/yolpol/bin/yolpol-deploy-policy`, and the logrotate file with the exact owners/modes above.
6. Run `visudo -cf deploy/operations/sudoers.yolpol-deploy` before installing it as `/etc/sudoers.d/yolpol-deploy`, owned by root with mode `0440`, then run `visudo -cf /etc/sudoers.d/yolpol-deploy` again.
7. As root, run the wrapper's `validate`. As the operator, verify the one allowed wrapper command, rejection of malformed arguments, and failure of direct Docker, Compose, shell, systemctl, and alternate sudo commands.

The sudoers `ALL` before `(root)` is the host selector. `NOPASSWD:NOSETENV` applies only to the exact wrapper pathname; `env_reset`, a fixed `secure_path`, and `use_pty` are command-specific defaults. Although sudo permits arbitrary wrapper arguments, the wrapper itself permits only the grammar documented above.

## Repository validation

`pnpm test:deployment` runs unit and behavioral policy tests plus resolved Compose-model checks when the Compose CLI is available. `pnpm test:deployment:disposable` builds an isolated Linux image with real sudo, `visudo`, and ACL tools; it exercises the argv grammar, control-byte backup IDs, environment poisoning, ownership/mode/symlink/ACL rejection, and actual sudo argument matching. The harness creates no volumes, touches no VPS, and removes its uniquely tagged image. The release gate also rebuilds all five Docker targets and inspects each image's effective `Config.User`.

## Remaining operational limitations

Root review/promotion is intentionally manual. This foundation does not provide signed release attestations, off-server backup durability, a backup scheduler, migration approval, DNS/TLS/firewall setup, registry credential rotation, PostgreSQL role provisioning, Production Compose, or disaster-recovery cutover. Those omissions must not be worked around by expanding operator sudo.
