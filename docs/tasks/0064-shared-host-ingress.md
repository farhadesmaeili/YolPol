# Task 0064: Shared Host Ingress for Staging and Production

## Status

Implemented, locally validated, and migrated successfully on the current VPS on 2026-09-19. Shared ingress is running as the sole steady-state public listener, Staging and its Blackbox probes use the shared Staging ingress network, and the legacy edge is stopped and retained for rollback. Production remains unprovisioned and is not live. The executed migration and verification evidence are recorded in `docs/deployments/shared-host-ingress-2026-09-19.md`.

## Decision

Use one dedicated Compose project, `yolpol-ingress`, installed at fixed path `/opt/yolpol/ingress`, as the sole steady-state owner of public TCP 80/443 and UDP 443 on the one-VPS topology. It routes:

```text
staging.yolpol.com -> staging-web:3000 on yolpol-staging-ingress
yolpol.com         -> production-web:3000 on yolpol-production-ingress
www.yolpol.com     -> permanent https://yolpol.com{uri} redirect
```

The two external bridge network names and web aliases are source-controlled and policy-validated. Only the matching environment's `web` joins each ingress network. Shared ingress joins those two networks and no backend network. PostgreSQL, workers, migration, backup, Staff, and Telegram operations remain absent, so Caddy cannot reach either database through Docker networking and cannot bridge the private environment networks.

Shared ingress has its own digest-pinned Caddy image and `yolpol-ingress_caddy_data` / `yolpol-ingress_caddy_config` volumes. It receives no application secret, provider credential, release manifest, host network, privileged mode, device, or Docker socket. It is host infrastructure, not a sixth first-party release-manifest role.

## Port and legacy-edge model

Production's gated local edge and Caddy state were removed. Production exposes `web` only through `yolpol-production-ingress` and has no port-publishing service.

The Staging `edge` definition remains temporarily under profile `legacy-staging-edge-migration`. Its original local `yolpol-staging_edge` network and Caddy volumes are retained so the currently deployed listener can continue serving while Staging web is attached to the new ingress network, and so root can roll back after cutover. The service is absent from ordinary startup; `deploy-edge` is removed from the operator wrapper. Only an explicitly reviewed root migration/rollback procedure may start it. Shared ingress and legacy edge must never run as public listeners simultaneously.

## Operations and health

The wrapper fixes all paths, project names, services, networks, and Compose arguments. It adds only `ingress-validate`, `ingress-status`, `ingress-health`, and `ingress-health-production`; it provides no ingress start/deploy command and accepts no extra arguments. Root owns ingress lifecycle and future bootstrap/cutover. Sudoers is unchanged.

Validation checks the fixed files, closed four-key non-secret runtime schema, exact resolved Compose model, pinned image, published ports, capabilities, mounts, resources, networks, and volumes without needing either application backend live. `ingress-health` separately requires the running Caddy service, valid configuration, and Staging readiness reachability. `ingress-health-production` adds Production readiness and is intentionally used only after Production exists. Public HTTPS hostname verification remains a cutover step, not a repository test.

## Current-host migration and rollback

The active Staging manifest/checksum was copied to `/opt/yolpol/releases/staging/active` and verified byte-for-byte before handoff. The legacy `/opt/yolpol/releases/active` authority remains intentionally retained for rollback compatibility; no Production active release was provisioned.

The reviewed sequence was followed: fixed files and networks were installed and validated; Staging web acquired `staging-web` on the new ingress network; the legacy edge was stopped; free public ports were confirmed; shared ingress was started; and runtime, Staging routing, TLS, wrapper validation, and Monitoring probes were verified. The reverse order remains the rollback procedure: stop shared ingress before restarting only the profiled legacy edge and then re-verify Staging. Exact operational constraints remain in `deploy/ingress/README.md`.

## Cloudflare, TLS, and Production activation

The current live Cloudflare redirect remains `yolpol.com -> staging.yolpol.com`. Shared ingress and Staging have been verified, but the redirect must remain until Production runtime, secrets, database, authenticated release, backup/recovery readiness, migration decision, web, and workers are healthy; Production ingress routing and rollback are verified; and DNS/Cloudflare cutover is separately approved.

Caddy obtained valid certificates for `staging.yolpol.com`, `yolpol.com`, and `www.yolpol.com` during the approved migration. The temporary, path-scoped Cloudflare Flexible SSL rule for HTTP-01 compatibility is current operational state, not a permanent architecture requirement. The redirect remains active, and final Production DNS/Cloudflare cutover is still a separate approved operation.

## Release, bootstrap, and monitoring compatibility

Staging and Production may run different authenticated releases because ingress reads neither manifest. Replacing either web container preserves its stable network alias and does not recreate or restart shared ingress. An ingress image/configuration change has its own root-controlled infrastructure lifecycle.

Future bootstrap has deterministic project path, project identity, external network names, file modes, runtime schema, state volumes, validation, startup order, migration prerequisite, and rollback procedure. Full bootstrap and release automation remain separate tasks.

Monitoring now identifies the shared ingress container and probes Staging web through the stable Staging alias. No active Production public-route monitoring is claimed. Production route probes and final environment-labeled public ingress monitoring remain gated on Production activation and a focused monitoring review.

## Acceptance evidence

Deployment tests cover sole steady-state port ownership, legacy-edge profile/wrapper rejection, removal of Production local edge, hostname routing and canonical redirect, fixed network names and aliases, backend isolation, ingress hardening, closed wrapper grammar, resolved Compose mutation rejection, independent release authorities, and ingress release independence. Repository-only Compose resolution does not start containers or require public DNS.

## Intentionally deferred

Production provisioning/deployment, temporary-redirect removal, final Cloudflare Production cutover, Production monitoring activation, Telegram webhook registration, full bootstrap/release automation, and cleanup of retained rollback assets remain deferred. This ingress migration performed no application release promotion or database migration.
