# Task 0064: Shared Host Ingress for Staging and Production

## Status

Required prerequisite for real Production deployment on the initial one-VPS topology. Not implemented by Task 0063.

## Problem

The verified Staging Caddy project currently owns public TCP 80/443 and UDP 443. A second Production Compose project cannot bind the same host IP and ports concurrently. Stopping or rebinding Staging implicitly would violate the availability and deployment-isolation contracts.

Task 0063 therefore keeps Production edge behind the `shared-ingress-prerequisite` profile, publishes no Production host port, and exposes no `production-deploy-edge` wrapper action. Private Production database, web, and worker preparation does not make Production publicly deployable.

## Required outcome

Introduce one reviewed host-ingress authority that concurrently routes:

```text
staging.yolpol.com -> isolated Staging web backend
yolpol.com         -> isolated Production web backend
www.yolpol.com     -> permanent canonical apex redirect
```

The design must preserve separate PostgreSQL data, credentials, runtime files, secrets, provider state, backups, application networks, and environment-specific release authority. The ingress service must receive no application, database, Telegram, Groq, Staff, backup, or recovery credential.

## Required design work

- Decide and document ownership of the single public 80/443 listener, TLS state, Caddy configuration, and rollback state.
- Add narrowly scoped ingress-to-environment networks without joining Staging and Production backend/database networks.
- Migrate the already-deployed Staging listener through an explicit, reversible root-controlled procedure with health checks and no implicit Staging shutdown.
- Define fixed filesystem paths, owners/modes, Compose project identity, policy validation, resource limits, logging, and certificate prerequisites.
- Extend the restricted wrapper only with fixed operations that cannot select arbitrary hosts, routes, networks, files, or services.
- Update Monitoring with explicit environment-labeled probes after the routing design is approved.
- Update bootstrap and release automation contracts so Production promotion stops before public activation unless shared ingress is installed and healthy.

## Acceptance tests

- Staging and Production web services run concurrently with distinct projects, networks, runtime refs, and releases.
- Exactly one repository-authorized ingress service publishes the intended public ports.
- Both hosts route to the correct isolated backend and pass environment-appropriate readiness/indexing checks.
- Unknown hosts and cross-environment routing fail closed.
- Staging remains available during the reviewed transition or the procedure stops and rolls back explicitly.
- Production activation cannot overwrite Staging TLS/config state, and Staging rollback cannot select Production state.
- No ingress container receives application secrets or Docker socket access.

DNS, Cloudflare, certificate issuance, VPS mutation, and live cutover remain separately approved operational actions even after the repository contract is implemented.
