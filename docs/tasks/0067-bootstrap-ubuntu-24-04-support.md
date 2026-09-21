# Task 0067: Bootstrap Ubuntu 24.04 Support

## Status

Implemented as a repository-only, fail-closed compatibility change and validated locally and in the disposable Debian Linux harness. On the live VPS, trusted bootstrap source was established and the old Debian-12-only `apply` was attempted; source validation passed, then `validate_supported_host()` rejected Ubuntu 24.04/noble before prerequisite, user, directory, or managed-contract installation. Phase B did not converge or activate, no Production activation occurred, and release `v0.1.8` remains untagged until bootstrap and control-plane readiness is complete. This documentation correction makes no VPS change.

## Reason

The Phase C activation audit established that the real YOLPOL VPS runs Ubuntu 24.04.5 LTS with operating-system identity `ubuntu`, version `24.04`, codename `noble`, machine architecture `x86_64`, and Debian package architecture `amd64`. Docker Engine 29.8.0 and Docker Compose v5.5.1 are active through Docker's official Ubuntu `noble` repository, and the required Compose executable path works.

Task 0065 intentionally supported only Debian 12/bookworm. Its host validation therefore rejected the live `apply` attempt safely, while Docker prerequisite installation was also fixed to Docker's Debian/bookworm repository. Because rejection occurred at the supported-host gate, bootstrap did not reach prerequisite or host-foundation mutation. Relaxing only host validation would have selected the wrong package repository and was not acceptable.

## Supported-host contract

The bootstrap now has exactly two immutable supported-host entries:

| Operating-system ID | Version | Codename and Docker suite | Machine architecture | Docker repository |
| --- | --- | --- | --- | --- |
| `debian` | `12` | `bookworm` | `x86_64` | `https://download.docker.com/linux/debian` |
| `ubuntu` | `24.04` | `noble` | `x86_64` | `https://download.docker.com/linux/ubuntu` |

Validation requires an exact `ID`, `VERSION_ID`, and `VERSION_CODENAME` match plus `x86_64`. It does not accept `ID_LIKE`. Unsupported Ubuntu and Debian releases, codename mismatches, related distributions, and other architectures continue to fail closed without reflecting caller-controlled host metadata in errors.

The validated host contract is passed into prerequisite installation. It fixes both the Docker signing-key URL and the deb822 repository source. Debian renders `linux/debian` plus `bookworm`; Ubuntu renders `linux/ubuntu` plus `noble`. Both retain component `stable`, architecture `amd64`, keyring `/etc/apt/keyrings/docker.asc`, the existing signing-key fingerprint check, refusal to replace incompatible repository/key files implicitly, and Compose at `/usr/libexec/docker/cli-plugins/docker-compose`.

## Unchanged security and activation boundaries

- `yolpol-operator` remains exactly UID/GID `1001:1001`, with no supplementary groups, Docker access, or sudo beyond the exact wrapper.
- Container UID/GID `10001:10001` must not identify a host user or group.
- The deployment agent remains the isolated UID/GID `1002:1002`, with no supplementary groups or Docker access. Those numeric IDs are currently available on the VPS.
- Root-only source trust, fixed source paths, non-symlink and ACL validation, closed schemas, atomic managed-file behavior, and explicit contract replacement are unchanged.
- Bootstrap remains idempotent and non-destructive. It does not remove volumes, backups, releases, secrets, networks, or data.
- It does not deploy an application, run a migration, activate Production, start YOLPOL Compose workloads, or change Cloudflare or DNS.

The live `yolpol-operator` currently has the supplementary group `users`, which violates the unchanged bootstrap contract. That host identity must be reconciled separately before bootstrap convergence. This change deliberately does not accept or repair that membership.

## Validation

- `pnpm test:bootstrap`: 1 file and 8 tests passed.
- `pnpm test:deployment`: 6 files and 56 tests passed.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test:deployment:disposable`: the Debian-based image passed 25 Linux bootstrap/command tests, including the real Debian 12 host check, mocked Debian 12 and Ubuntu 24.04 acceptance, unsupported release/distribution/codename/architecture rejection, and exact Docker repository/key URL rendering for both supported hosts.

The disposable image proves real Debian behavior. Ubuntu behavior is deterministic through mocked `/etc/os-release` and architecture inputs; no developer or host package repository is modified by those tests. Reapplying the updated bootstrap and reconciling the live operator account remain separate, explicitly controlled VPS operations.
