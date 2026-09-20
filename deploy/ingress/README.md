# YOLPOL shared host ingress

This directory defines the shared ingress for the initial one-VPS topology. The fixed Compose project is `yolpol-ingress`, installed at `/opt/yolpol/ingress`, and it is the only steady-state project authorized to publish host TCP 80/443 and UDP 443. The current VPS migration completed successfully on 2026-09-19; the deployment record is `docs/deployments/shared-host-ingress-2026-09-19.md`.

## Architecture and isolation

Caddy routes `staging.yolpol.com` to the stable `staging-web:3000` alias on external network `yolpol-staging-ingress`, routes `yolpol.com` to `production-web:3000` on `yolpol-production-ingress`, and permanently redirects `www.yolpol.com` to `https://yolpol.com{uri}`. Caddy's normal reverse proxy preserves request paths and query strings and supplies the standard forwarded headers. No catch-all host route is defined.

Among application services, only Staging `web` joins the Staging ingress network and only Production `web` joins the Production ingress network. Staging's read-only Blackbox observer may also join the Staging ingress network; it never joins Production ingress. Neither PostgreSQL service, worker, migration, backup, Staff, nor Telegram operation joins an ingress network. Shared ingress joins no backend or provider-egress network, mounts no Docker socket, and receives no application or provider secret. The two ingress networks do not connect the application environments to each other; Caddy is the only service present on both and can reach only the two web aliases.

The Caddy image is digest-pinned. Its root filesystem is read-only, all capabilities are dropped except `NET_BIND_SERVICE`, `no-new-privileges` is enabled, `/tmp` is a bounded private tmpfs, and memory, CPU, PID, and rotated-log limits are fixed and policy-validated. The upstream image retains its proven root process because binding container ports 80/443 requires the one retained capability. It is not privileged and has no host networking or devices.

## Fixed host contract

Future root bootstrap must create the following deterministic state:

```text
/opt/yolpol/ingress/                       root:root 0750
  compose.yaml                             root:root 0644
  Caddyfile                                root:root 0644
  runtime.env                              root:root 0600

Docker networks:
  yolpol-staging-ingress                   root-created external bridge
  yolpol-production-ingress                root-created external bridge

Compose project:
  yolpol-ingress

Project-owned volumes:
  yolpol-ingress_caddy_data
  yolpol-ingress_caddy_config
```

The Caddy volumes are dedicated ingress state. They never reuse `yolpol-staging_caddy_*` or any removed Production-local Caddy state. The external networks must be created with those exact names after root verifies that no conflicting network exists. Application deployment then attaches replacement web containers by stable network alias; no container ID or fixed IP is recorded.

`runtime.env` is copied from `runtime.env.example` and has a closed, non-secret four-key schema. Shared ingress is host infrastructure, not one of the five first-party release-manifest roles and does not read either active application manifest. Updating its digest or configuration is a separately reviewed root infrastructure change, not an ordinary Staging or Production release.

## Closed operational surface and health semantics

The restricted wrapper exposes only:

- `ingress-validate`: validate fixed files, the closed runtime schema, and resolved Compose policy without starting ingress or requiring a live backend.
- `ingress-status`: show the fixed ingress project after validation.
- `ingress-health`: require the ingress container to be running, revalidate its Caddy configuration, and verify reachability of Staging readiness through `staging-web`.
- `ingress-health-production`: perform the Staging checks and additionally verify Production readiness through `production-web`.

Before Production exists, use `ingress-validate`, `ingress-status`, and `ingress-health`; repository validation does not require a live Production backend. Use `ingress-health-production` only after the Production application has been provisioned and deployed. These backend checks prove the ingress container's environment-specific network reachability; the later cutover runbook must also verify each public hostname over HTTPS.

There is deliberately no `ingress-deploy`, caller-selected path/project/network/service, or arbitrary Docker argument. Starting, stopping, or changing shared ingress is root-only infrastructure work. The sudoers grant is unchanged.

## Current live state and retained rollback

Shared ingress is healthy and owns public 80/443. Staging web is reachable as `staging-web` on `yolpol-staging-ingress`; Monitoring Blackbox Exporter uses the same network for its Staging probes. The legacy Staging edge is stopped, while its container, network, Caddy state, and `/opt/yolpol/releases/active` authority are intentionally retained for rollback. The verified Staging authority is also present at `/opt/yolpol/releases/staging/active`. No Production authority or application runtime has been provisioned.

Cloudflare still temporarily redirects `yolpol.com` and `www.yolpol.com` to `staging.yolpol.com`. A path-scoped temporary compatibility rule currently permits HTTP-01 handling for `/.well-known/acme-challenge/` on the proxied apex and `www` hostnames. Do not treat that rule as a permanent architecture requirement. The redirect must remain until Production runtime, secrets, database, release and workers are ready, rollback is ready, and a separate Production cutover is explicitly approved.

## Root-controlled migration and rollback procedure

Never start shared ingress while any legacy listener owns 80/443.

The current VPS completed this sequence successfully on 2026-09-19. It remains the authoritative order for reconstructing or rolling back the handoff; consult the deployment record before changing retained rollback state.

1. Complete the legacy Staging release-authority migration, then install the reviewed Staging, Production, ingress, policy, and wrapper files with the fixed ownership/modes.
2. Inspect for conflicting Docker networks, then create exactly `yolpol-staging-ingress` and `yolpol-production-ingress` as root-owned external bridge networks.
3. Validate all three resolved Compose contracts. Validate the ingress Caddyfile with a one-shot `caddy validate`; validation must not start Caddy or request a certificate.
4. Recreate only Staging `web` through the fixed application command. It remains connected to the old Staging-local edge network for uninterrupted legacy routing and also acquires alias `staging-web` on the new external ingress network.
5. Confirm the legacy public Staging route is still healthy and confirm an isolated root validation can reach `http://staging-web:3000/api/health/ready` from the ingress network.
6. In one controlled maintenance action, stop the legacy `yolpol-staging` `edge` service. Confirm 80/443 are free. Do not remove its Caddy volumes.
7. Immediately start only the fixed `yolpol-ingress` `ingress` service as root.
8. Run `ingress-status`, `ingress-health`, and public HTTPS liveness/readiness and application smoke checks for `staging.yolpol.com`. Confirm certificate behavior and logs without exposing content or credentials. Only after this succeeds, activate the revised Monitoring network/alert contract so it does not falsely expect shared ingress during the handoff.
9. If any check fails, stop shared ingress before restarting the profiled legacy Staging edge. Confirm only the legacy listener owns 80/443, then verify Staging again. Diagnose offline before retrying.
10. Only later, after the full Production activation gate, deploy Production web on `yolpol-production-ingress`, run `ingress-health-production`, verify the Production hostname path locally, and perform the separately approved DNS/Cloudflare cutover and smoke test.

The old Staging-local `edge` network and `yolpol-staging_caddy_*` volumes are retained only to make rollback possible. The `edge` service is behind `legacy-staging-edge-migration`, is absent from ordinary startup, and has no wrapper command. Root may remove that temporary rollback contract only in a later reviewed cleanup after the shared ingress has a proven operating history.

## Production activation gate

A Caddy route does not make Production live. Public activation still requires Production runtime and secret provisioning, an isolated database, an authenticated Production release authority, immutable images, backup/recovery readiness, an explicit migration decision, healthy web and workers, successful `ingress-health-production`, public-route verification, rollback readiness, explicit DNS/Cloudflare approval, and a smoke test. The temporary redirect must not be removed earlier.

## Automation and monitoring

Future bootstrap automation can install the fixed directory, files, modes, networks, runtime schema, and dedicated volumes deterministically. Future release automation replaces Staging or Production web on its stable external network and leaves `yolpol-ingress` running; application releases neither recreate ingress nor change its Caddy state.

Monitoring now identifies the shared ingress container separately and reaches Staging web through `staging-web` on the Staging ingress network. This does not claim that a public Production probe is active. After Production activation, add explicit shared-ingress availability, Staging public-route, and Production public-route probes with environment labels through a separately reviewed monitoring change and dedicated acceptance test.

## Intentionally unsupported here

The ingress contract does not automate VPS bootstrap, ingress lifecycle, certificate requests, DNS/Cloudflare changes, secret creation, Production provisioning/public activation, database recovery, or Telegram registration. Task 0066 adds an inactive release-deployment contract without granting it ingress mutation. The completed manual migration did not remove the temporary redirect, provision Production, run an application database migration, or clean up retained rollback assets.
