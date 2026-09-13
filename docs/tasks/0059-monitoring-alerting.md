# Task 0059: Monitoring and Alerting Foundation

## Status

Implemented as a repository and local/synthetic foundation only. No server, DNS, Cloudflare, Production deployment, real credential, external Telegram call, backup schedule, or Docker volume deletion is part of this task.

## Decision

Use one resource-bounded `yolpol-monitoring` Prometheus/Alertmanager project for the Linux host. Collect host metrics with Node Exporter, Docker container metrics with cAdvisor, PostgreSQL system metrics with PostgreSQL Exporter, internal web health semantics with Blackbox Exporter, and application-specific operational aggregates with a small Node/`pg` exporter. Defer Grafana because Prometheus already provides the initial query UI and alerting does not require another persistent service.

The full architecture, image pins, network/host access, credential and future role model, queue predicates, backup activation state machine, alerts and thresholds, inhibition, UI access, local no-notification validation, resource footprint, persistence, future host filesystem, and Production extension are documented in `deploy/monitoring/README.md`.

## Architecture and topology

- The separate `yolpol-monitoring` project contains Prometheus, Alertmanager, Node Exporter, cAdvisor, PostgreSQL Exporter, Blackbox Exporter, and a small repository-owned Operations Exporter. Grafana is deferred because it is not required for alerting and would add persistent resource cost.
- Scrapes use a 30-second interval. Prometheus retention is bounded to 15 days and 2 GB. Prometheus and Alertmanager use isolated named operational-data volumes; their history is not added to the PostgreSQL backup contract.
- Prometheus-facing traffic uses an internal network. Blackbox joins only `yolpol-staging_edge`; PostgreSQL and Operations exporters join only `yolpol-staging_backend`; only Alertmanager receives a deliberate egress network.
- Prometheus and Alertmanager bind to host loopback for SSH-tunnel access. No exporter publishes a host port and no Caddy route is added.
- Resource ceilings total 1,408 MB and 1.5 CPU on the approximately 4-vCPU/8-GB initial host. All monitoring logs use bounded Docker `json-file` rotation.

## Signals and safety contracts

- Blackbox tests the unchanged internal `/api/health/live` and `/api/health/ready` semantics. Queue depth, backup age, and host health are deliberately not added to readiness.
- Node Exporter supplies CPU, available memory, swap, filesystem, and disk capacity. cAdvisor supplies stable Compose service-label presence and container resource signals. Exact restart counters are not claimed; absence, start-time context, and alert history are the reliable contract.
- PostgreSQL Exporter uses file-backed URI/user/password inputs and low-cardinality built-in collectors without statement text or Customer-row inspection. A future dedicated `pg_monitor` login plus explicit queue-table `SELECT` grants is an operational provisioning step, not an application migration.
- The Operations Exporter performs one aggregate, lease-aware, read-only query across the three existing queue tables. Its only labels are fixed `environment` and `queue` values. It reads encrypted backup artifact/manifest pairs read-only, validates naming/size/SHA-256 without an age identity, and never decrypts or reads backup content.
- Backup monitoring is explicitly disabled by default. Enabled-without-valid-backup, scan-failure, valid-but-stale, and disabled states remain distinguishable. Eight/twelve-hour thresholds are initial values derived from a future six-hour schedule plus jitter; this is an approximate RPO, not zero-data-loss.

## Alerting and delivery

- Rules cover web liveness/readiness, PostgreSQL/exporter health and connection pressure, host disk/memory/CPU/swap/filesystem pressure, critical application and worker absence, queue age/count, backup missing/stale/scan failure, scrape failures, Alertmanager discovery, and Prometheus config/rule failures.
- Warnings are inhibited by corresponding critical alerts; readiness is inhibited by liveness failure; PostgreSQL failure suppresses derivative Operations Exporter/scrape noise. Thresholds and `for` durations are documented as low-volume starting points requiring host measurements.
- The default local Alertmanager receiver is inert. Future Telegram delivery uses a separate Operations bot/channel with file-backed bot-token and chat-ID secrets, sends resolved status, and includes only stable operational labels and a concise summary.

## Local validation and deferred work

The disposable harness uses unique networks/containers, tmpfs PostgreSQL, synthetic credentials, a synthetic web server, and the null Alertmanager receiver. It checks all eight scrape targets, both probes, metric privacy/cardinality, loopback bindings, non-root custom runtime, and graceful shutdown. It removes only its containers and networks and deliberately does not delete named monitoring volumes. Production Compose, server provisioning, DNS/TLS/Cloudflare, real Telegram delivery, backup scheduling, Grafana, an independent Prometheus watchdog, PITR, release automation, and Production targets remain deferred.

## Preserved boundaries

- `/api/health/live` and `/api/health/ready` remain cheap and unchanged.
- Staging project/network names already resolve deterministically to `yolpol-staging_edge` and `yolpol-staging_backend`; Staging Compose needs no change.
- Existing queue statuses, leases, retries, indexes, repositories, workers, and schemas remain authoritative and unchanged.
- Backup manifests/artifacts remain encrypted; monitoring verifies the pair without an age identity or Customer-content access.
- PostgreSQL role provisioning is a server operation, not a Drizzle migration.
- Monitoring Telegram credentials are separate from application/Staff Telegram configuration.
- Prometheus and Alertmanager are loopback-only; exporters have no published ports.
- CI required-check names and workflow remain unchanged.

## Verification contract

Required local checks are `pnpm lint`, `pnpm typecheck`, `pnpm test:monitoring`, `pnpm test`, `pnpm test:integration`, `pnpm db:check`, and `pnpm build`. Monitoring-specific validation uses official `promtool`, `amtool`, Blackbox configuration checking, Compose rendering with synthetic secret files, a disposable PostgreSQL/exporter smoke, a synthetic web health probe, operations exporter metric/privacy and backup checks, target/network/port inspection, image user/secret inspection, and graceful termination. No validation receiver may contact Telegram.
