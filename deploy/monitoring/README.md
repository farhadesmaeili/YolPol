# YOLPOL Monitoring and Alerting

This directory defines the future host-level `yolpol-monitoring` Compose project. It observes YOLPOL deployments without publishing application, database, exporter, or monitoring administration endpoints to the Internet. It does not provision a server, deploy Production, create credentials, schedule backups, or contact Telegram by itself.

## Architecture

One Prometheus and Alertmanager pair is shared by environments on the same host. Staging collectors use the deterministic networks created by Compose project `yolpol-staging`: `yolpol-staging_edge` for Blackbox HTTP probes and `yolpol-staging_backend` for PostgreSQL collectors. The internal `yolpol-monitoring_monitoring` network carries scrape traffic. Only Alertmanager joins `alert_egress`; collectors do not receive a general Internet path through the monitoring project.

Prometheus and Alertmanager publish loopback-only ports `127.0.0.1:9090` and `127.0.0.1:9093`. Use an authenticated SSH tunnel on a future host. Do not proxy either UI through public Caddy. Node Exporter, cAdvisor, PostgreSQL Exporter, Blackbox Exporter, and the operations exporter publish no host ports.

The initial 30-second scrape/evaluation interval avoids high-frequency database and host polling. Prometheus retains at most 15 days and 2 GB by default. Its named volume and Alertmanager's named volume are isolated from Staging PostgreSQL/Caddy volumes. Metrics history and silences are rebuildable operational state and are not part of the critical PostgreSQL backup flow.

The repository-owned Operations Exporter remains locally buildable with the Compose `build` entry and `yolpol-operations-metrics:local` default. Future Staging/Production activation must set `YOLPOL_OPERATIONS_METRICS_IMAGE` to the checksum-verified release manifest's immutable `repository@sha256:digest` reference and run Compose with `--no-build`. It must be the same digest accepted in Staging; a SemVer tag or `latest` is not a deployment identity. Upstream monitoring image pins remain unchanged.

Grafana is deliberately deferred. Prometheus provides the query/expression UI needed to activate and tune this alerting foundation; another long-running dashboard service is not justified on the initial approximately 4-vCPU/8-GB host.

## Service inventory and access

| Service | Purpose | Networks | Host access | Default limit |
| --- | --- | --- | --- | --- |
| Prometheus 3.14.0 | scrape, rules, bounded TSDB | monitoring | loopback UI only | 512 MB / 0.50 CPU |
| Alertmanager 0.32.1 | grouping, inhibition, future Ops Telegram routing | monitoring, alert egress | loopback UI only | 128 MB / 0.15 CPU |
| Node Exporter 1.12.1 | host CPU, memory, disk, filesystem, swap | monitoring | host PID plus read-only `/proc`, `/sys`, `/` | 128 MB / 0.15 CPU |
| cAdvisor 0.60.5 | container presence/resources and Compose labels | monitoring | read-only root/sys/Docker state and Docker socket | 256 MB / 0.30 CPU |
| PostgreSQL Exporter 0.20.1 | connection/activity/database metrics | monitoring, Staging backend | PostgreSQL only | 128 MB / 0.15 CPU |
| Blackbox Exporter 0.28.0 | exact HTTP 200 probes for `/live` and `/ready` | monitoring, Staging edge | no host access | 128 MB / 0.10 CPU |
| YOLPOL Operations Exporter | aggregate queues and backup freshness | monitoring, Staging backend | read-only backup directory | 128 MB / 0.15 CPU |

These limits total 1,408 MB and 1.5 CPU; they are ceilings, not reservations, and normal steady use should be materially lower. Measure on the real Linux host before tightening them. Every service uses bounded `json-file` logging (10 MB times three by default), a read-only root filesystem, dropped capabilities, and `no-new-privileges` where compatible. Prometheus, Alertmanager, Node Exporter, PostgreSQL Exporter, Blackbox Exporter, and the custom exporter run non-root.

cAdvisor is the only root-running monitoring container and the only component with Docker daemon visibility. Stable `com.docker.compose.project` and `com.docker.compose.service` labels require Docker discovery. The socket bind is read-only at the filesystem layer but the Docker API itself has no read-only authorization mode, so treat cAdvisor as host-privileged infrastructure, pin and review its image, and never copy this mount to application or custom exporter code. It still uses a read-only root filesystem, drops all capabilities, sets `no-new-privileges`, and is not run with `privileged: true`. Node Exporter receives no Docker socket.

## Web, PostgreSQL, queues, and backups

Blackbox probes the internal web address, not public DNS or TLS. Liveness remains dependency-free. Readiness remains the cheap application/database/migration check; queue, host, and backup state are not added to `/api/health/ready`. A future external Staging probe can be added only after real DNS/TLS deployment and from a monitoring path that actually tests the public route.

PostgreSQL Exporter enables only the database, settings, and activity collectors needed for exporter health, connection usage, transaction/activity health, and database size. It does not enable statement/query-text collection, auto-discovery, or custom SQL. `DATA_SOURCE_URI_FILE`, `DATA_SOURCE_USER_FILE`, and `DATA_SOURCE_PASS_FILE` keep credentials out of YAML and process arguments. The image runs as UID/GID 65534, so future host secret files need a narrowly granted read path.

The operations exporter is a dedicated Node 22 process using the repository's pinned `pg` dependency, a two-connection pool, short connection/query/statement timeouts, and one aggregate SQL statement per scrape. It queries only:

- `inquiry_outbox`, matching unprocessed `available_at` and `locked_until` claim predicates;
- `conversation_translation_jobs`, matching `PENDING` or recoverable expired `RUNNING` jobs below three attempts;
- `conversation_ai_response_jobs`, matching due `PENDING` or recoverable expired `RUNNING` jobs below three attempts.

The existing partial/claim indexes support these low-volume aggregate predicates. No Customer, inquiry, conversation, message, recipient, product, prompt, price, or payload table is joined or selected. Metrics use only fixed `environment` and `queue` labels. The exporter returns a failed scrape rather than stale queue values when PostgreSQL collection fails, and logs only a safe stage/error code.

Backup monitoring is opt-in because automatic scheduling is deferred. `YOLPOL_MONITORING_STAGING_BACKUP_ENABLED=false` emits an explicit disabled state and suppresses freshness alerts. When enabled, the exporter reads the backup directory read-only, rejects symlinks, validates the version-1 manifest contract, exact artifact pairing/size, and SHA-256, and never decrypts an artifact or mounts the private age identity. Integrity scans are cached for five minutes by default.

The three states are distinct:

- disabled: `yolpol_backup_monitoring_enabled=0`; no missing/stale alert;
- enabled with no valid pair or failed directory scan: explicit zero existence/scan metrics and a critical alert;
- enabled with a valid pair: timestamp and age metrics drive eight-hour warning and twelve-hour critical thresholds.

The proposed six-hour backup interval is only an approximate RPO. The eight/twelve-hour alert values allow schedule jitter and do not promise zero data loss. Tune them after scheduling and off-server durability are operational. PITR remains deferred.

## Alerts and limitations

Rules cover sustained web liveness/readiness failure, PostgreSQL exporter/down and 80/90-percent connection pressure, host disk at 15/8-percent free, memory at 15/8-percent available, CPU at 85/95 percent, swap/filesystem pressure, required service and worker absence, per-queue age at 10/30 minutes, queue counts at 25/100, operations exporter failure, enabled backup missing/stale/scan failure, target scrape failure, Alertmanager discovery, and Prometheus rule/config failures. Warning/critical thresholds are initial low-volume defaults and require tuning from real measurements.

Alertmanager inhibits warnings superseded by the same critical condition, readiness when liveness is already critical, and selected derivative scrape failures during PostgreSQL failure. Routes are intentionally small and send resolved Telegram notifications when the production receiver is selected.

cAdvisor reliably provides current presence and container start time with stable Compose labels. It does not provide a trustworthy Docker restart counter for this design. Container absence, recent start time during investigation, Docker restart policy, and alert history are the supported signals. No worker HTTP endpoint or persisted heartbeat is added. Prometheus cannot alert about its own total process/host failure; a future independent external watchdog is still required.

## Credentials and database role

Future host layout:

```text
/opt/yolpol/monitoring/
  compose.yaml
  runtime.env
  prometheus/
  alertmanager/
  blackbox/
  secrets/
    alert-telegram-bot-token
    alert-telegram-chat-id
    staging-postgres-exporter-uri
    staging-postgres-exporter-user
    staging-postgres-exporter-password
    staging-operations-database-url
```

Keep `secrets/` mode `700` and files mode `600` or equivalently restricted to the deployment identity and required container UID. Telegram alert credentials belong to a dedicated YOLPOL Operations bot/channel and must not reuse the application/Staff bot automatically. `staging-operations-database-url` is a complete connection URL in a mounted file; it is never an environment value or log field.

Initially, local validation may use a disposable owner credential. Do not call that least privilege. On a real host, provision a dedicated login outside Drizzle migrations. The intended PostgreSQL 17 contract is conceptually:

```sql
CREATE ROLE yolpol_monitoring LOGIN PASSWORD '<generated-outside-shell-history>';
GRANT CONNECT ON DATABASE yolpol TO yolpol_monitoring;
GRANT pg_monitor TO yolpol_monitoring;
GRANT USAGE ON SCHEMA public TO yolpol_monitoring;
GRANT SELECT ON TABLE public.inquiry_outbox,
  public.conversation_translation_jobs,
  public.conversation_ai_response_jobs TO yolpol_monitoring;
```

Provision and rotate the actual password through server operations. Confirm the database name and ownership model before executing SQL. This repository does not run it and adds no application migration.

## Safe validation and activation

`alertmanager.local.yml` has a null receiver and is the Compose default. It cannot send an external notification. `alertmanager.telegram.yml` is source-controlled structure only and uses `/run/secrets/alert_telegram_bot_token` plus `/run/secrets/alert_telegram_chat_id`. Validate it with `amtool check-config`; do not start it with synthetic values or make a Telegram request.

Local configuration validation uses only disposable files containing synthetic values. Docker Desktop cannot apply Linux `rslave` propagation to its virtualized root mount, so the automated smoke adds `compose.docker-desktop-validation.yaml`; the production Compose file retains `rslave` for the Linux VPS:

```sh
docker run --rm --entrypoint promtool -v "$PWD/prometheus:/etc/prometheus:ro" quay.io/prometheus/prometheus:v3.14.0 check config /etc/prometheus/prometheus.yml
docker run --rm --entrypoint promtool -v "$PWD/prometheus/rules:/rules:ro" quay.io/prometheus/prometheus:v3.14.0 check rules /rules/yolpol-alerts.yml
docker run --rm --entrypoint promtool -v "$PWD/prometheus:/etc/prometheus:ro" quay.io/prometheus/prometheus:v3.14.0 test rules /etc/prometheus/tests/yolpol-alerts.test.yml
docker run --rm --entrypoint amtool -v "$PWD/alertmanager:/etc/alertmanager:ro" quay.io/prometheus/alertmanager:v0.32.1 check-config /etc/alertmanager/alertmanager.local.yml
docker run --rm --entrypoint amtool -v "$PWD/alertmanager:/etc/alertmanager:ro" quay.io/prometheus/alertmanager:v0.32.1 check-config /etc/alertmanager/alertmanager.telegram.yml
docker run --rm --entrypoint blackbox_exporter -v "$PWD/blackbox:/etc/blackbox_exporter:ro" quay.io/prometheus/blackbox-exporter:v0.28.0 --config.check --config.file=/etc/blackbox_exporter/blackbox.yml
```

From the repository root, `pnpm test:monitoring:disposable` runs the complete stack against a temporary PostgreSQL database and a synthetic health server. It uses the local null Alertmanager receiver, publishes the two administration ports on loopback-only alternate ports, verifies every scrape target and both blackbox probes, checks bounded exporter labels, and exercises graceful exporter shutdown. It removes only its uniquely prefixed containers and networks; named Prometheus and Alertmanager validation volumes are deliberately retained.

For a disposable runtime smoke test, use unique container/network names, tmpfs or temporary host directories instead of named volumes, the local null receiver, synthetic PostgreSQL, and synthetic backup pairs. Stop and remove only those disposable containers/networks. Never use `docker compose down -v`, delete `yolpol-staging_*` volumes, or point the exporter at Development data.

Future activation order is: provision `/opt/yolpol/monitoring`; create restricted database and dedicated Ops Telegram secret files; keep the local null receiver while starting collectors; verify every Prometheus target and alert rule; select `alertmanager.telegram.yml`; trigger one controlled test alert; confirm firing and resolved messages; then declare delivery operational. This branch performs none of those external steps and sends no Telegram call.

Future Production integration reuses Prometheus, Alertmanager, Node Exporter, and cAdvisor. Add explicit Production edge/backend external networks, dedicated PostgreSQL/operations exporter instances and secret files, Production Blackbox targets, and fixed `environment="production"` labels. Do not share database credentials or create a second monitoring stack.
