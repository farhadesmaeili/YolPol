# YOLPOL Restricted Deployment Operations

Task 0066 preserves this public closed grammar and its single global mutation lock. Compose execution now also exists in `/opt/yolpol/bin/yolpol-deploy-internal`, a root-only mode-`0500` primitive that is never sudo-exposed. Public human actions acquire the lock once and delegate fixed internal action names; the authenticated release controller holds the same lock across its entire transaction and never recursively calls this wrapper.

This directory defines a repository-side contract for a future VPS. Nothing here installs sudoers, contacts a server, changes Docker, creates credentials, runs migrations, or deploys containers.

## Security boundary

`yolpol-operator` remains an unprivileged SSH account. It must not be in the `docker` group, read `/var/run/docker.sock`, receive unrestricted sudo, or own any trusted deployment path. Root SSH remains the separate bootstrap, Monitoring, recovery, retention, and emergency path.

All unattended sudo grants terminate at the root-owned `/opt/yolpol/bin/yolpol-deploy` wrapper. The operator may invoke the wrapper's closed grammar; the isolated deployment agent may invoke only its two exact argument-free intent actions. A pathname-only sudo specification would permit arbitrary arguments, so the agent rule includes the fixed arguments and the wrapper independently rejects every unknown command, missing argument, extra argument, and malformed backup identifier before executing an operation. Do not add sudoers wildcards or another executable.

The wrapper and standard-library Python policy helper:

- use fixed absolute paths, a fixed Compose plugin, fixed project names, and an `env -i` execution environment;
- accept no caller-selected file, directory, image, environment, service, mount, command, or Docker endpoint;
- validate the environment-specific authenticated root-promoted release manifest and checksum, full revision, exact first-party repositories, and digest-only image references;
- parse each runtime file as a closed schema, rejecting duplicate, missing, unknown, control-bearing, `COMPOSE_*`, and `DOCKER_*` entries;
- validate resolved `docker compose config --format json`, including exact services, commands, profiles, builds, images, environments, mounts, secrets, networks, published ports, and top-level resources;
- reject privilege, device, capability, host-network, unexpected host-PID, namespace, inherited-volume, configuration, and unexpected service-key additions;
- validate every trusted leaf and ancestor for type, symlink absence, numeric owner/group, mode, and absence of extended/default ACLs;
- serialize mutating operations with a root-only `flock` file and write started/final audit records durably;
- keep migration and backup program output in a rotated root-only operation log so credentials or provider errors cannot reach the operator terminal;
- require a real input/output/error TTY for the two argument-free Staff operations, whose existing CLIs keep password input hidden.

## Operator command surface

| Command | Fixed behavior |
| --- | --- |
| `validate` | Validate trusted host paths, release/runtime contracts, and both resolved Compose models. |
| `status` | Show `compose ps` for the two fixed projects; no application logs. |
| `health` | Check the five fixed Staging services and the code-owned web readiness request. |
| `pull-approved-images` | Pull only the images in the two validated resolved models. |
| `deploy-database` | Start/update only Staging PostgreSQL, with `--no-build --no-deps`. |
| `migrate` | Run only the fixed image-only migration service, non-interactively and with `--no-deps`. |
| `deploy-app` | Start/update only the Staging web service. |
| `deploy-workers` | Start/update only the three named Staging workers. |
| `staff-provision` | Interactively run only the existing ADMIN/SALES provisioning CLI in the fixed Staff operation service. |
| `staff-bootstrap-super-admin` | Interactively run only the existing first-Super-Admin bootstrap CLI in its fixed Staff operation service. |
| `telegram-webhook-set` | Noninteractively register the exact Staging Telegram webhook while preserving pending updates; mutates Telegram provider state. |
| `telegram-webhook-info` | Noninteractively read the current Telegram webhook status through the existing secret-safe tooling. |
| `backup-create` | Run the fixed encrypted backup service after a 5 GiB free-space floor and 15-minute success throttle. |
| `backup-verify <backup-id>` | Run identity-free verification for one strict ASCII Staging backup identifier. |

There is deliberately no operator `deploy-edge`, `production-deploy-edge`, `ingress-deploy`, or `deploy-monitoring` command. Restore, deep verification with the recovery identity, backup retention/deletion, arbitrary logs, shell/exec, systemctl, firewall, secret rotation, Docker administration, and database administration remain unavailable.

Production uses a second, equally closed namespace rather than a caller-selected environment flag. The explicit commands are `production-validate`, `production-status`, `production-health`, `production-pull-approved-images`, `production-deploy-database`, `production-migrate`, `production-deploy-app`, `production-deploy-workers`, `production-staff-provision`, `production-staff-bootstrap-super-admin`, `production-telegram-webhook-set`, `production-telegram-webhook-info`, `production-backup-create`, and `production-backup-verify <backup-id>`. Every command fixes `/opt/yolpol/production`, project `yolpol-production`, the Production Compose/runtime files, named services, and (where applicable) a strict `yolpol-production-...` backup ID. Existing unprefixed commands retain their Staging/Monitoring behavior and do not require Production to be installed. Production has no local edge service.

Shared ingress exposes four argument-free read-only actions: `ingress-validate`, `ingress-status`, `ingress-health`, and `ingress-health-production`. They fix `/opt/yolpol/ingress`, project `yolpol-ingress`, both external network identities, and service `ingress`. Validation does not require a backend; ordinary health requires Staging reachability; Production health is a separate post-deployment check. Starting/stopping ingress and using the profiled legacy Staging edge remain root-only migration/recovery work. The caller cannot select an environment, path, project, service, network, Caddyfile, image, or Docker argument.

The Staff commands accept no additional arguments. They use Compose's normal interactive mode and deliberately omit `--interactive=false`, `--no-TTY`, and `--no-build`; the wrapper first proves all three standard streams are terminals. The service command, worker image digest, UID/GID, application database environment file, backend-only network, and resource limits are fixed and policy-validated. Prompts must remain visible, so Staff CLI output is not redirected into the operation log; the normal metadata-only started/final audit records still apply. The password is read by the existing hidden-input implementation and is never placed in arguments, environment, Compose configuration, Git, or wrapper logs.

The Telegram actions also accept no additional arguments and use fixed noninteractive Compose `run --rm --no-deps` commands. They deliberately omit `--no-build`, which is unsupported for `run`; the validated promoted Compose model remains image-only. The set action is serialized by the deployment lock and mutates Telegram provider state. The info action is read-only. Their existing TypeScript entrypoints emit only a validated public webhook URL, status/count metadata, redacted provider-error text, or a generic failure. Never place Telegram credentials in command arguments, runtime.env, logs, or documentation.

## Runtime and release authority

The Staging, Production, shared-ingress, and Monitoring examples enumerate four independent complete runtime schemas. Each application environment contains one full lowercase Git SHA; four fixed YOLPOL repository digest references; environment-specific paths, resource/logging limits, retention values, public age recipient, public Telegram username, and fixed webhook origin. Staging retains legacy edge binding values only for root migration/rollback; Production has none. Ingress has only four fixed non-secret Caddy resource/logging values and no release/image or credential input. Monitoring contains the fifth first-party digest plus its Staging-specific loopback ports, config/secret paths, fixed external networks, and disabled-by-default backup monitoring. No additional key is supported.

Active release authority is environment-specific:

```text
/opt/yolpol/releases/staging/active/release-manifest.json
/opt/yolpol/releases/staging/active/release-manifest.sha256
/opt/yolpol/releases/production/active/release-manifest.json
/opt/yolpol/releases/production/active/release-manifest.sha256
```

All four files are root-owned, mode `0600`, non-symlinks beneath root-only ancestors. Staging and the currently Staging-specific Monitoring project validate only the Staging authority. Production validates only the Production authority. The helper duplicates the repository release contract for both environments: fixed source repository, version/tag/full SHA/platform/database fingerprint, exactly five roles and targets, exact repositories, digest syntax, and internally consistent immutable refs. Staging may therefore advance while Production retains its previously approved manifest and runtime refs; rollback selection is also independent.

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
    staging/                                       root:root 0700
      active/                                      root:root 0700
        release-manifest.json                      root:root 0600
        release-manifest.sha256                    root:root 0600
    production/                                    root:root 0700
      active/                                      root:root 0700
        release-manifest.json                      root:root 0600
        release-manifest.sha256                    root:root 0600
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
  production/                                      root:root 0750
    compose.yaml                                    root:root 0644
    runtime.env                                     root:root 0600
    secrets/                                        root:root 0700
      postgres.env, app/migration/backup-database.env root:root 0400
      restore-database.env                          root:root 0400 (only during explicit recovery)
      telegram-*, groq-api-key                      10001:10001 0400
      backup-age-identity                           10001:10001 0400 (only during explicit recovery)
    backups/                                        10001:10001 0700
  ingress/                                         root:root 0750
    compose.yaml, Caddyfile                         root:root 0644
    runtime.env                                     root:root 0600
  monitoring/                                      root:root 0750
    compose.yaml                                    root:root 0644
    runtime.env                                     root:root 0600
    prometheus/, alertmanager/, blackbox/            root:root 0755
    secrets/                                        root:root 0700
      alert-telegram-*, staging-postgres-exporter-* 65534:65534 0400
      staging-operations-database-url               10001:10001 0400
```

`runtime/production-last-backup-created-at` is an additional `root:root 0600` throttle-state file. Production and Staging have distinct Compose projects, databases, backend networks, runtime files, secrets, backups, Telegram/provider credentials, and throttle state. Shared ingress owns separate `yolpol-ingress_caddy_data` and `yolpol-ingress_caddy_config` volumes and only the two fixed external ingress networks; it reuses neither legacy Staging Caddy state nor application state.

`incoming/` is the only operator-writable path. The wrapper never reads it. Root promotion must copy reviewed bytes into a root-controlled temporary path, set final ownership/modes, and atomically place them below the trusted tree. All listed paths and the fixed system executable chain are checked with shell type predicates, `readlink -f`, `stat`, and `getfacl`; symlinks, writable ancestors, named ACL entries, ACL masks, and default ACLs fail closed. Because no checked ancestor is operator-writable, validation-to-execution races are outside the attacker model.

Promote the repository-managed Staging, Production, ingress, and Monitoring files into exactly the paths shown above and run Compose with their fixed project directories. All promoted Compose definitions are image-only: `/opt/yolpol` needs no source checkout or Dockerfile, and any resolved service `build` metadata fails policy validation. Relative configuration binds remain confined to their fixed project directory while first-party images come only from authenticated application manifests. Ingress uses its separately pinned upstream image and neither application authority.

## Audit and resource controls

Create both logs and state files before enabling sudo. Every valid invocation must append a `started` record before work and a final success/failure record; rejected sudo invocations append `denied`. Records contain only UTC timestamp, sanitized sudo actor, fixed action, validated-or-unknown revision, validated backup ID or `none`, result, and exit code. `sync -f` makes each append durable. A failed audit preflight prevents the operation.

Install `logrotate.yolpol-deploy` as `/etc/logrotate.d/yolpol-deploy`, `root:root 0644`. It rotates both root-only logs weekly or at 10 MiB, retains 13 compressed generations, and creates replacements as `0600 root:root`. The operation log may contain sensitive subprocess diagnostics and is never exposed through the wrapper.

Backup creation additionally requires at least 5 GiB available in the fixed backup filesystem and at least 900 seconds since the last successful wrapper-created backup. Compose memory, CPU, PID, read-only-root, tmpfs, and capability controls remain validated. Staff operation containers additionally have a fixed non-root user, read-only root filesystem, private tmpfs, no public port, no provider-egress network, and no provider secret. Telegram operation containers use the same non-root/read-only/capability controls and a bounded private tmpfs required by `tsx`, receive no database or Groq configuration, publish no port, mount no host path, and attach only to provider egress. Scheduling, remote durability, and destructive retention are separate root decisions.

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

## Root bootstrap automation

Task 0065 turns the former manual installation gate into the executable, tested workflow in `deploy/bootstrap/README.md`. Root must first place independently authenticated repository bytes at the fixed root-only `/root/yolpol-bootstrap-source` boundary. Only that source copy may run `apply` or `refresh-contracts`; the installed `/opt/yolpol/bin/yolpol-bootstrap` accepts closed runtime, application/Monitoring secret, and independently authenticated release inputs. Base `check` validates only the host foundation, with separate named environment checks. Recovery credentials remain deferred to an explicit recovery workflow. Bootstrap starts no YOLPOL Compose workload and remains outside sudoers; installing Docker on a clean host may enable the Docker daemon as a prerequisite.

The detailed steps below remain the authoritative security checklist and explain what the automation enforces:

1. Confirm the operator is exactly UID/GID 1001 with no supplementary groups, UID/GID 10001 are unused, the operator has no Docker socket access, and effective sudo is exactly the one wrapper grant.
2. Install Python 3, `acl`/`getfacl`, Docker Engine, and the Compose plugin at the fixed `/usr/libexec/docker/cli-plugins/docker-compose` path. Confirm every executable and ancestor matches the wrapper contract.
3. Create the hierarchy and empty state/log files above, including the independent Production backup-throttle file, without truncating existing audit history. Create `/root/.docker/config.json` as `root:root 0600`; do not expose its contents. Inspect then create the fixed `yolpol-staging-ingress` and `yolpol-production-ingress` external bridge networks; do not accept caller-selected names.
4. Authenticate and verify each approved release outside the operator upload path, then root-promote its manifest/checksum only into the intended environment-specific active directory together with that environment's runtime refs. Installing this wrapper on the existing VPS requires a deliberate root migration of the currently active Staging authority from the legacy `/opt/yolpol/releases/active` location into `/opt/yolpol/releases/staging/active`; never copy that value into Production implicitly.
5. Install `yolpol-deploy`, `yolpol-deploy-policy.py` as `/opt/yolpol/bin/yolpol-deploy-policy`, and the logrotate file with the exact owners/modes above.
6. Run `visudo -cf deploy/operations/sudoers.yolpol-deploy` before installing it as `/etc/sudoers.d/yolpol-deploy`, owned by root with mode `0440`, then run `visudo -cf /etc/sudoers.d/yolpol-deploy` again.
7. As root, run the wrapper's application and ingress validation actions. As the operator, verify the one allowed wrapper command, rejection of malformed arguments and all edge/deploy attempts, and failure of direct Docker, Compose, shell, systemctl, and alternate sudo commands. Follow `deploy/ingress/README.md` for the separately controlled listener handoff; installation alone must not start ingress.

The sudoers `ALL` before `(root)` is the host selector. `NOPASSWD:NOSETENV` applies only to the exact wrapper pathname; `env_reset`, a fixed `secure_path`, and `use_pty` are command-specific defaults. Although sudo permits arbitrary wrapper arguments, the wrapper itself permits only the grammar documented above.

## Repository validation

`pnpm test:deployment` runs unit and behavioral policy tests plus resolved Compose-model checks when the Compose CLI is available. `pnpm test:deployment:disposable` builds an isolated Linux image with real sudo, `visudo`, and ACL tools; it exercises the argv grammar, control-byte backup IDs, environment poisoning, ownership/mode/symlink/ACL rejection, and actual sudo argument matching. The harness creates no volumes, touches no VPS, and removes its uniquely tagged image. The release gate also rebuilds all five Docker targets and inspects each image's effective `Config.User`.

## Production monitoring boundary

The existing Monitoring project remains intentionally Staging-specific. It is not extended with Production database/exporter credentials, backup mounts, endpoint targets, or Production networks in this feature. Production monitoring requires a separately reviewed repository change and root-only activation; never reuse Staging monitoring credentials to bridge the gap.

## Shared-host ingress contract

The initial target is one VPS. The current host reached repository steady state on 2026-09-19: `yolpol-ingress` owns public 80/443, and the verified legacy Staging Caddy is stopped and retained for rollback. Staging's old edge remains profile-gated for root rollback and has no wrapper start action; Production's local edge is removed. Shared ingress attaches only to `yolpol-staging-ingress` and `yolpol-production-ingress`, while each environment exposes only its web alias and keeps databases/workers on separate networks.

Task 0064 defines the repository contract, and the live handoff and Staging verification are recorded in `docs/deployments/shared-host-ingress-2026-09-19.md`. The current Cloudflare redirect `yolpol.com -> staging.yolpol.com` remains active until Production is fully ready, rollback is prepared, and cutover is separately approved. The precise migration, rollback, health phases, Caddy state, TLS/DNS boundary, and activation gate are documented in `deploy/ingress/README.md`.

## Remaining operational limitations

Shared ingress was deployed manually. The repository now provides the Phase B bootstrap workflow and the inactive Phase C1 authenticated deployment control plane, but neither has been applied or activated on the current VPS by these tasks. The foundation still does not provide signed release attestations, activate Production monitoring, provide Phase C2 off-server backup durability or scheduling, automate Production-changing migrations, perform final Production DNS/Cloudflare cutover, rotate registry credentials, provision PostgreSQL roles, or perform disaster-recovery cutover. Those omissions must not be worked around by expanding operator sudo.
