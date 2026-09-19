# Shared Host Ingress Migration Record: 2026-09-19

## Migration result

The current VPS at `82.115.21.171` was successfully migrated from the legacy Staging edge to the shared host ingress contract defined by Task 0064. The related Staging Monitoring path was migrated to the shared Staging ingress network and verified.

This was an infrastructure handoff, not an application release promotion. Staging remains on `v0.1.7`; no application database migration was performed. Production application containers, database, secrets, runtime configuration, and release authority have not been provisioned, and Production is not live.

## Pre-migration protection

Before the public listener handoff:

1. A fresh Staging database backup was created and verified successfully:

   ```text
   yolpol-staging-20260919T200643Z-6b4833c876d562a78369cb1c34663002508aeb97
   ```

2. A host rollback snapshot was created at:

   ```text
   /opt/yolpol/releases/pre-shared-ingress-20260919T200848Z
   ```

   It records the prior release authority, Staging and Monitoring deployment files, wrapper and policy files, sudoers deployment policy, and runtime state listings needed for rollback.

3. The existing Staging active release manifest and checksum were copied to `/opt/yolpol/releases/staging/active` and verified byte-for-byte. The legacy authority at `/opt/yolpol/releases/active` was deliberately retained for rollback compatibility.

4. No Production active release was provisioned.

## Installed ingress contract

The active shared ingress project is `yolpol-ingress` at `/opt/yolpol/ingress`. Its healthy `yolpol-ingress-ingress-1` container is the sole steady-state owner of host TCP 80/443 and UDP 443.

The shared ingress joins the external `yolpol-staging-ingress` and `yolpol-production-ingress` networks. Staging web joins both its normal `yolpol-staging_backend` network and `yolpol-staging-ingress`, where it has the stable alias `staging-web`. The legacy Staging edge network remains available only as a retained rollback asset.

The routing contract is:

```text
staging.yolpol.com -> staging-web:3000
yolpol.com         -> production-web:3000
www.yolpol.com     -> permanent https://yolpol.com{uri} redirect
```

`yolpol-production-ingress` currently contains shared ingress but no Production web container. Direct origin access to `yolpol.com` therefore completes TLS successfully and returns the expected HTTP `502` for the unavailable `production-web` backend. That response does not mean Production is deployed.

## Cloudflare and TLS bootstrap

At migration time, `staging.yolpol.com` resolved directly to `82.115.21.171`, while the apex and `www` records remained proxied through Cloudflare. The temporary Cloudflare redirect from `yolpol.com` and `www.yolpol.com` to `staging.yolpol.com` remains active and excludes `/.well-known/acme-challenge/`.

A narrowly scoped temporary Cloudflare Configuration Rule applies Flexible SSL only to `yolpol.com` and `www.yolpol.com` requests whose path begins with `/.well-known/acme-challenge/`. It was introduced as current bootstrap and renewal compatibility for HTTP-01 while those hostnames remain proxied; it is not a permanent shared-ingress architecture requirement.

During issuance, TLS-ALPN-01 for the proxied apex failed as expected because the Cloudflare proxy did not pass the ACME ALPN challenge transparently. Caddy then completed HTTP-01 and obtained Let's Encrypt certificates for all three hostnames.

Direct-origin verification after issuance produced:

| Hostname | HTTP result | TLS result | Interpretation |
| --- | ---: | --- | --- |
| `staging.yolpol.com` | `200` | valid | Staging served successfully |
| `yolpol.com` | `502` | valid | Expected until `production-web` exists |
| `www.yolpol.com` | `301` | valid | Canonical redirect to the apex |

Normal public apex and `www` requests continue to be intercepted by Cloudflare and temporarily redirected to Staging.

## Public listener handoff

The controlled handoff completed in this order:

1. Verified the legacy Caddy configuration and the locally available pinned shared Caddy image.
2. Verified Staging health.
3. Stopped `yolpol-staging-edge-1`.
4. Confirmed host ports 80/443 were free.
5. Started `yolpol-ingress-ingress-1`.
6. Verified shared ingress health and HTTP `200` from public Staging health.

The shared ingress now owns the public listeners. The legacy edge exited successfully and remains stopped but available for rollback. It was not deleted; its network and volumes were not deleted, and no database data was deleted.

## Monitoring migration

Blackbox Exporter was recreated so that it no longer joins `yolpol-staging_edge`. It now joins:

- `yolpol-monitoring_monitoring`
- `yolpol-staging-ingress`

Operations Exporter remains on `yolpol-monitoring_monitoring` and `yolpol-staging_backend` and was not unnecessarily recreated. Prometheus now probes these targets through Blackbox Exporter:

- `http://staging-web:3000/api/health/live`
- `http://staging-web:3000/api/health/ready`

The running Prometheus container still exposed the previous `web:3000` bind-mounted configuration even though the host `prometheus.yml` contained the new `staging-web` targets, and the host and container configuration SHA-256 values differed. Only Prometheus was force-recreated. Its `prometheus_data` volume was preserved; Alertmanager, Operations Exporter, Node Exporter, PostgreSQL Exporter, and cAdvisor were not recreated.

Before and after recreation, the expected host configuration SHA-256 was:

```text
ac0dc8992359b58af94eb9f13e2e084ab6f952f0865a412c83176eebebce93c1
```

After recreation, the host and container configuration hashes matched. Prometheus was Ready, both new targets reported `up{job="blackbox-web"} = 1`, and both probes reported `probe_success{job="blackbox-web"} = 1`. The former `web:3000` series aged out and was no longer current.

## Final verification

The final audit verified:

- `yolpol-ingress-ingress-1` is running, healthy, attached to both environment ingress networks, and owns public 80/443.
- `yolpol-staging-edge-1` is retained in exited state for rollback.
- Staging web is attached to `yolpol-staging_backend` and `yolpol-staging-ingress` with alias `staging-web`; its legacy edge attachment may remain for rollback compatibility.
- Staging ingress contains shared ingress, Staging web, and Monitoring Blackbox Exporter.
- Production ingress contains shared ingress only.
- Blackbox Exporter no longer uses `yolpol-staging_edge`.

The installed wrapper validations completed successfully:

```text
/opt/yolpol/bin/yolpol-deploy validate          exit 0
/opt/yolpol/bin/yolpol-deploy ingress-validate  exit 0
```

Final public Staging readiness at `https://staging.yolpol.com/api/health/ready` returned HTTP `200`. A normal Cloudflare request to `https://yolpol.com/...` continued to return the temporary HTTP `307` redirect to `https://staging.yolpol.com/...`.

## Retained rollback assets

The following are intentional rollback assets, not accidental leftovers:

- the stopped legacy Staging edge container;
- the legacy Staging edge network;
- `/opt/yolpol/releases/active`;
- `/opt/yolpol/releases/pre-shared-ingress-20260919T200848Z`;
- the verified pre-migration database backup.

No cleanup or deletion was performed. Removal requires separate approval after shared ingress has sufficient operational history.

## Remaining roadmap

This migration completes the manual shared-host-ingress runtime migration for the current VPS. It does not make Production live and does not provide server or release deployment automation.

Remaining work includes:

1. Automating repeatable server bootstrap, including secure configuration and secrets, ingress and environment networks, deployment policy, and Monitoring.
2. Automating exact-release Staging deployment and approval-gated Production deployment with environment-specific release authorities and rollback handling.
3. Provisioning the Production runtime configuration, secrets, PostgreSQL database, release authority, application containers, and Monitoring integration.
4. Completing Production smoke and health verification.
5. Performing a separately approved Cloudflare Production cutover only after Production is verified, then reviewing the temporary redirect and ACME compatibility rule. `www` must continue its canonical redirect to `yolpol.com`.
