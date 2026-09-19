# Task 0064: Shared Host Ingress for Staging and Production

## Status

Implemented and locally validated as a repository-only contract. Shared ingress is not installed or running, Production is not public, the current VPS and legacy Staging listener are unchanged, and no DNS, Cloudflare, certificate, secret, database, deployment, commit, or push operation is part of this task.

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

The current VPS still uses legacy `/opt/yolpol/releases/active`. Before installing the revised wrapper/policy, root must deliberately migrate the active Staging manifest/checksum to `/opt/yolpol/releases/staging/active`; Production retains independent `/opt/yolpol/releases/production/active`. This release-authority migration is separate from application data and is not executed here.

After that prerequisite, the reviewed future sequence is: install fixed files; inspect/create the two fixed external networks; validate contracts and Caddy configuration without starting it; recreate Staging web so it remains on the old local edge network and also gains `staging-web` on the new ingress network; verify current Staging; stop legacy edge; confirm 80/443 are free; start shared ingress; verify runtime, Staging route, TLS, and smoke behavior. On failure, stop shared ingress first, then restart only the profiled legacy edge and re-verify Staging. Exact commands and ownership/modes are in `deploy/ingress/README.md`.

## Cloudflare, TLS, and Production activation

The current live Cloudflare redirect remains `yolpol.com -> staging.yolpol.com`. This task neither changes nor assumes removal of that redirect. It must remain until shared ingress is deployed and Staging is verified through it; Production runtime, secrets, database, authenticated release, backup/recovery readiness, migration decision, web, and workers are healthy; Production ingress routing and rollback are verified; and DNS/Cloudflare cutover is separately approved.

Caddy configuration is suitable for automatic HTTPS when later started, but repository validation does not request a certificate. DNS, Cloudflare proxy/redirect configuration, firewall state, certificate issuance, and live smoke testing remain separate approved operations.

## Release, bootstrap, and monitoring compatibility

Staging and Production may run different authenticated releases because ingress reads neither manifest. Replacing either web container preserves its stable network alias and does not recreate or restart shared ingress. An ingress image/configuration change has its own root-controlled infrastructure lifecycle.

Future bootstrap has deterministic project path, project identity, external network names, file modes, runtime schema, state volumes, validation, startup order, migration prerequisite, and rollback procedure. Full bootstrap and release automation remain separate tasks.

Monitoring now identifies the shared ingress container and probes Staging web through the stable Staging alias. No active Production public-route monitoring is claimed. Production route probes and final environment-labeled public ingress monitoring remain gated on Production activation and a focused monitoring review.

## Acceptance evidence

Deployment tests cover sole steady-state port ownership, legacy-edge profile/wrapper rejection, removal of Production local edge, hostname routing and canonical redirect, fixed network names and aliases, backend isolation, ingress hardening, closed wrapper grammar, resolved Compose mutation rejection, independent release authorities, and ingress release independence. Repository-only Compose resolution does not start containers or require public DNS.

## Intentionally deferred

VPS mutation, network creation, listener handoff, certificate issuance, DNS/Cloudflare changes, temporary-redirect removal, Production provisioning/deployment, real secrets, database operations, Telegram webhook registration, full bootstrap/release automation, and Production monitoring activation are not performed here.
