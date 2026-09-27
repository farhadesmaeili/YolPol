# YOLPOL Monitoring and Alerting

This directory defines the single host-level `yolpol-monitoring` Compose project. It observes YOLPOL deployments without publishing application, database, exporter, or monitoring administration endpoints to the Internet. Staging monitoring is active on the current VPS. The repository contract now includes isolated Production collectors, but it does not provision their database role or credentials, mutate the VPS, activate Production monitoring, schedule backups, or contact Telegram.

## Architecture

One Prometheus and Alertmanager pair is shared by environments on the same host, as are Node Exporter and cAdvisor. Environment-specific access is held by separate collectors: the Staging PostgreSQL and Operations exporters join only `yolpol-staging_backend`, while their Production counterparts join only `yolpol-production_backend`; the Staging Blackbox joins only `yolpol-staging-ingress`, while the Production Blackbox joins only `yolpol-production-ingress`. Both Blackbox instances resolve only their stable environment web alias. The internal `yolpol-monitoring_monitoring` network carries scrape traffic. Only Alertmanager joins `alert_egress`; no collector bridges environments or receives a general Internet path through the monitoring project.

Prometheus and Alertmanager publish loopback-only ports `127.0.0.1:9090` and `127.0.0.1:9093`. Loopback is a network-exposure control, not authentication: any local host account able to connect to those ports can use the UIs. Keep local accounts trusted and minimal. Do not proxy either UI through public Caddy. The current VPS SSH policy disables TCP forwarding, so remote UI access is intentionally unavailable until a separate authenticated administrative-access design is reviewed. Node Exporter, cAdvisor, PostgreSQL Exporter, Blackbox Exporter, and the Operations Exporter publish no host ports.

The initial 30-second scrape/evaluation interval avoids high-frequency database and host polling. Prometheus retains at most 15 days and 2 GB by default. Its named volume and Alertmanager's named volume are isolated from Staging PostgreSQL/Caddy volumes. Metrics history and silences are rebuildable operational state and are not part of the critical PostgreSQL backup flow.

The deployment Compose definition is image-only and gives the repository-owned Operations Exporter the deterministic `yolpol-operations-metrics:local` default for local validation. Build that image explicitly from the repository root with `docker build --target monitoring-runtime --tag yolpol-operations-metrics:local .`; Compose never builds it implicitly. Monitoring intentionally remains infrastructure managed by the authenticated Staging release authority: one `YOLPOL_OPERATIONS_METRICS_IMAGE`, validated against `/opt/yolpol/releases/staging/active`, is used by both environment-specific Operations Exporters. This avoids a caller-selected or mixed-manifest monitoring stack and does not read or modify Production release authority. Automated Staging deployment and rollback pull and recreate only the Staging Operations Exporter. Before root activates or recreates the Production collector, root must review compatibility with both active environment releases and immutable digests; when Staging is N+1 and Production is N, the newer Staging-authorized image must not be consumed blindly. Activation must use the checksum-verified manifest's immutable `repository@sha256:digest` reference and run Compose with `--no-build`. A SemVer tag or `latest` is not a deployment identity. Per-environment monitoring image authority is deferred to a separate reviewed change.

Grafana is deliberately deferred. Prometheus provides the query/expression UI needed to activate and tune this alerting foundation; another long-running dashboard service is not justified on the initial approximately 4-vCPU/8-GB host.

## Service inventory and access

| Service | Purpose | Networks | Host access | Default limit |
| --- | --- | --- | --- | --- |
| Prometheus 3.14.0 | scrape, rules, bounded TSDB | monitoring | loopback UI only | 512 MB / 0.50 CPU |
| Alertmanager 0.32.1 | grouping, inhibition, future Ops Telegram routing | monitoring, alert egress | loopback UI only | 128 MB / 0.15 CPU |
| Node Exporter 1.12.1 | host CPU, memory, disk, filesystem, swap | monitoring | host PID plus read-only `/proc`, `/sys`, `/` | 128 MB / 0.15 CPU |
| cAdvisor 0.60.5 | container presence/resources and Compose labels | monitoring | read-only root/sys/Docker state and Docker socket | 256 MB / 0.30 CPU |
| Staging PostgreSQL Exporter 0.20.1 | connection/activity/database metrics | monitoring, Staging backend | Staging PostgreSQL only | 128 MB / 0.15 CPU |
| Production PostgreSQL Exporter 0.20.1 | connection/activity/database metrics | monitoring, Production backend | Production PostgreSQL only | 128 MB / 0.15 CPU |
| Staging Blackbox Exporter 0.28.0 | exact HTTP 200 probes for `/live` and `/ready` | monitoring, Staging ingress | no host access | 128 MB / 0.10 CPU |
| Production Blackbox Exporter 0.28.0 | exact HTTP 200 probes for `/live` and `/ready` | monitoring, Production ingress | no host access | 128 MB / 0.10 CPU |
| Staging YOLPOL Operations Exporter | aggregate queues and backup freshness | monitoring, Staging backend | read-only Staging backup directory | 128 MB / 0.15 CPU |
| Production YOLPOL Operations Exporter | aggregate queues and backup freshness | monitoring, Production backend | read-only Production backup directory | 128 MB / 0.15 CPU |

These limits total 1,792 MB and 1.90 CPU; they are ceilings, not reservations, and normal steady use should be materially lower. The increase is exactly the three Production collectors: 384 MB and 0.40 CPU. Shared-service limits are unchanged. Measure on the real Linux host before tightening them. Every service uses bounded `json-file` logging (10 MB times three by default), a read-only root filesystem, dropped capabilities, and `no-new-privileges` where compatible. Prometheus, Alertmanager, Node Exporter, both PostgreSQL Exporters, both Blackbox Exporters, and both custom exporters run non-root.

cAdvisor is the only root-running monitoring container and the only component with Docker daemon visibility. Stable `com.docker.compose.project` and `com.docker.compose.service` labels require Docker discovery. The socket bind is read-only at the filesystem layer but the Docker API itself has no read-only authorization mode, so treat cAdvisor as host-privileged infrastructure, pin and review its image, and never copy this mount to application or custom exporter code. It still uses a read-only root filesystem, drops all capabilities, sets `no-new-privileges`, and is not run with `privileged: true`. Node Exporter receives no Docker socket.

## Web, PostgreSQL, queues, and backups

Staging Blackbox probes `staging-web`; Production Blackbox probes `production-web`. Each reaches only `/api/health/live` and `/api/health/ready` through its environment's ingress network, never through public DNS or TLS. Liveness remains dependency-free. Readiness remains the cheap application/database/migration check; queue, host, and backup state are not added to `/api/health/ready`. cAdvisor separately alerts on the single shared `yolpol-ingress` service. These are distinct signals: neither is a public hostname/TLS probe. `https://yolpol.com` remains deliberately absent until the public cutover is complete, and an independent monitor outside this VPS remains deferred.

Each PostgreSQL Exporter enables only the database, settings, and activity collectors needed for exporter health, connection usage, transaction/activity health, and database size. Neither enables statement/query-text collection, auto-discovery, or custom SQL. Environment-specific `DATA_SOURCE_URI_FILE`, `DATA_SOURCE_USER_FILE`, and `DATA_SOURCE_PASS_FILE` values keep credentials out of YAML and process arguments. The image runs as UID/GID 65534, so host secret files have a narrowly granted read path.

Each environment has a dedicated Operations Exporter process using the repository's pinned Node 22/`pg` image, a two-connection pool, short connection/query/statement timeouts, and one aggregate SQL statement per scrape. Production is fixed to `YOLPOL_DEPLOYMENT_ENVIRONMENT=production` and its own database URL file. Both query only:

- `inquiry_outbox`, matching unprocessed `available_at` and `locked_until` claim predicates;
- `conversation_translation_jobs`, matching `PENDING` or recoverable expired `RUNNING` jobs below three attempts;
- `conversation_ai_response_jobs`, matching due `PENDING` or recoverable expired `RUNNING` jobs below three attempts.

The existing partial/claim indexes support these low-volume aggregate predicates. No Customer, inquiry, conversation, message, recipient, product, prompt, price, or payload table is joined or selected. Metrics use only fixed `environment` and `queue` labels. The exporter returns a failed scrape rather than stale queue values when PostgreSQL collection fails, and logs only a safe stage/error code.

Backup monitoring is opt-in because automatic scheduling is deferred. Both `YOLPOL_MONITORING_STAGING_BACKUP_ENABLED=false` and `YOLPOL_MONITORING_PRODUCTION_BACKUP_ENABLED=false` are fixed defaults that emit an explicit environment-labelled disabled state and suppress missing, scan-failure, and stale alerts. The Production exporter mounts `/opt/yolpol/production/backups` read-only. When enabled later, an exporter reads only its environment's backup directory, rejects symlinks, validates the version-1 manifest contract, exact artifact pairing/size, and SHA-256, and never decrypts an artifact or mounts the private age identity. This does not monitor Phase C2 remote durability, enable backup creation or retention, or provide PITR.

The three states are distinct:

- disabled: `yolpol_backup_monitoring_enabled=0`; no missing/stale alert;
- enabled with no valid pair or failed directory scan: explicit zero existence/scan metrics and a critical alert;
- enabled with a valid pair: timestamp and age metrics drive eight-hour warning and twelve-hour critical thresholds.

The proposed six-hour backup interval is only an approximate RPO. The eight/twelve-hour alert values allow schedule jitter and do not promise zero data loss. Tune them after scheduling and off-server durability are operational. PITR remains deferred.

## Alerts and limitations

Rules cover both environments' internal web liveness/readiness, PostgreSQL exporter/down and 80/90-percent connection pressure, Operations Exporter health, per-queue age at 10/30 minutes, queue counts at 25/100, enabled backup missing/stale/scan failure, target scrape failure, and exact required container presence for `web`, `postgres`, `inquiry-notifications`, `conversation-translation`, and `conversation-ai-fallback`. The shared-ingress and host alerts remain single shared signals. Profile-gated migration, backup, Staff, Telegram, and IndexNow operations are not treated as continuous services. Warning/critical thresholds are initial low-volume defaults and require tuning from real measurements.

Alertmanager inhibits warnings superseded by the same critical condition, readiness when liveness is already critical, and only the Operations Exporter alert plus PostgreSQL/Operations scrape failures during PostgreSQL exporter failure. Web and Blackbox scrape failures remain visible. Every inhibition equality includes `environment`, so a Staging source cannot suppress a Production target or vice versa. Routes are intentionally small and send resolved Telegram notifications only when the separately activated Telegram receiver is selected.

cAdvisor reliably provides current presence and container start time with stable Compose labels. It does not provide a trustworthy Docker restart counter for this design. Container absence, recent start time during investigation, Docker restart policy, and alert history are the supported signals. No worker HTTP endpoint or persisted heartbeat is added. Prometheus cannot alert about its own total process/host failure; a future independent external watchdog is still required.

## Credentials, host ownership, and database role

The authoritative VPS hierarchy and restricted sudo wrapper are documented in `deploy/operations/README.md`. The Monitoring portion remains:

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
    production-postgres-exporter-uri
    production-postgres-exporter-user
    production-postgres-exporter-password
    production-operations-database-url
```

Keep `secrets/` `root:root` mode `700`; `yolpol-operator` must not traverse it. Compose file-backed secrets retain numeric host ownership on Linux. Alertmanager and both environments' PostgreSQL Exporter secret files use upstream UID/GID `65534:65534` with mode `400`; each Operations Exporter database URL uses container-only UID/GID `10001:10001` with mode `400`. Production and Staging filenames and values are never interchangeable. Telegram alert credentials belong to a dedicated YOLPOL Operations bot/channel and must not reuse the application/Staff bot automatically. Each `*-operations-database-url` is a complete connection URL in a mounted file; it is never an environment value or log field.

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

For Production, the equivalent contract uses the confirmed Production database name and a dedicated Production login. One dedicated monitoring login may safely populate the PostgreSQL Exporter's split URI/user/password files and the Operations Exporter's full URL file because both collectors require the same union of `pg_monitor` and the three explicit table grants; the files remain separate formats and are never shared across environments. A later root operation must confirm the live ownership model, create/rotate the real credential, and install the four Production files. This repository does not execute SQL, create a password, or add an application migration.

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

From the repository root, `pnpm test:monitoring:disposable` runs the complete stack against separate temporary Staging and Production PostgreSQL databases and synthetic web aliases. It uses synthetic credentials and the local null Alertmanager receiver, publishes the two administration ports on loopback-only alternate ports, verifies all twelve scrape targets and four Blackbox probes, checks both environment labels and bounded exporter labels, inspects exact collector network membership, and exercises graceful shutdown of both Operations Exporters. It removes only its uniquely prefixed containers and networks; named Prometheus and Alertmanager validation volumes are deliberately retained.

For a disposable runtime smoke test, use unique container/network names, tmpfs or temporary host directories instead of named volumes, the local null receiver, synthetic PostgreSQL, and synthetic backup pairs. Stop and remove only those disposable containers/networks. Never use `docker compose down -v`, delete `yolpol-staging_*` volumes, or point the exporter at Development data.

The current VPS completed the shared-ingress Monitoring migration on 2026-09-19. Blackbox Exporter now joins `yolpol-staging-ingress` instead of `yolpol-staging_edge` and probes the `staging-web` liveness and readiness targets successfully. The running Prometheus container still exposed the previous bind-mounted `prometheus.yml` even though the host file contained the new `staging-web` targets. Only Prometheus was force-recreated so the container mount matched the reviewed host configuration; the `prometheus_data` volume was preserved, and the other Monitoring services were not unnecessarily recreated. Exact verification evidence is recorded in `docs/deployments/shared-host-ingress-2026-09-19.md`.

For a rebuild, complete the shared-ingress handoff and provision both environment backends/aliases before activating their collectors. Provision `/opt/yolpol/monitoring` under the root-owned contract; create the restricted environment-specific database credentials and dedicated Ops Telegram secret files; validate through `/opt/yolpol/bin/yolpol-deploy`; keep the local null receiver while root starts the ten explicitly named services using the exact command in `deploy/operations/README.md`; then verify every Prometheus target and alert rule. Selecting `alertmanager.telegram.yml` and making a controlled delivery test remain separate approved root operations. The operator wrapper cannot activate Monitoring because cAdvisor's Docker socket access is root-equivalent.

The Production Monitoring repository contract is implemented and validated without live activation. Production collector credentials, database-role provisioning, secret installation, contract refresh, and root-controlled VPS activation remain operational steps. The public `https://yolpol.com` DNS/TLS probe remains deferred until the final cutover, and an independent external watchdog is still required because Prometheus on this VPS cannot detect total VPS or Prometheus-host loss.
