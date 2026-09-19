# Task 0063: Production Deployment Foundation

## Status

Implemented and validated as a repository-only contract. Production is not bootstrapped or deployed. No VPS, Docker runtime, database, backup, DNS, Cloudflare, certificate, Telegram provider, GitHub Environment, real credential, commit, or push operation is part of this task.

## Decision

Add a fixed `/opt/yolpol/production` deployment contract with Compose project `yolpol-production`, application identity `production`, canonical origin `https://yolpol.com`, independent database/Caddy state, independent secret and backup paths, and Production-only Telegram/provider configuration. First-party images are required immutable references from the existing authenticated five-role release manifest; Production has no local-image fallback or build context.

Extend the existing root-owned wrapper with explicit `production-*` actions. Do not add a caller-selectable environment, path, Compose file, service, image, or command channel. Existing unprefixed Staging/Monitoring behavior remains independent and does not require Production files to exist.

## Operational boundaries

Normal Production services are web, PostgreSQL, and the three workers. Migration, encrypted backup, integrity/deep verification, retention, restore, Staff provisioning, Super Admin bootstrap, Telegram webhook tooling, and the blocked Production edge remain profile-gated. Restore, deep verification, retention deletion, secret management, bootstrap, recovery, and Monitoring activation remain root responsibilities.

Production uses its own database volume/credentials, Caddy volumes, networks, runtime file, secret directory, backup directory/artifact namespace/age material, Telegram bot/webhook secret/origin, provider credentials, backup-throttle state, and fixed `/opt/yolpol/releases/production/active` authority. Staging uses `/opt/yolpol/releases/staging/active`; either environment can advance or roll back without changing the other's manifest or runtime refs.

## Monitoring decision

The existing Monitoring project is Staging-specific and remains unchanged. Production monitoring is deferred to a focused follow-up because safe activation requires separately designed exporter credentials, network attachments, backup signals, endpoint probes, alert routing, and policy validation. Staging credentials or networks must not be reused.

## Automation compatibility

Fixed paths, owners/modes, closed runtime schema, immutable image roles, and explicit wrapper actions give later bootstrap and release-deployment automation deterministic inputs. Those workflows are not implemented here. The intended future sequence remains authenticated release verification, Staging validation, Production approval, pre-migration backup/durability gate, conditional explicit migration, exact digest deployment, readiness verification, and deployment recording.

Application rollback remains separate from database recovery. Equal migration identity permits application-only rollback planning; any schema difference stops automation for manual compatibility/recovery review. No down migration or automatic database restore is introduced.

## Shared-host ingress prerequisite

The real initial topology is one VPS and the verified Staging Caddy already owns public ports 80/443. Production edge is profile-gated, publishes no host port, and has no wrapper activation command. Task 0064 must introduce and validate the shared host-ingress authority before real Production deployment or release automation may expose `https://yolpol.com`.
