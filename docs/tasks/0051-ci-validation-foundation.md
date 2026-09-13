# CI Validation Foundation

## Goal and scope

This feature establishes the first automated repository safety gate for pull requests and protected-branch development. GitHub Actions validates pull requests plus pushes to `develop` and `main`; it does not deploy, publish, connect to a server, mutate DNS, configure Telegram, create releases, or write to a Development or Production database.

The workflow is intentionally limited to repository validation. Application behavior, database schemas and migrations, Docker Compose services, provider integrations, Staff and Customer behavior, and runtime environment configuration remain unchanged.

## Runtime and dependency installation

All jobs run on GitHub-hosted Ubuntu runners with Node.js 22 and the repository-declared pnpm `11.14.0`. Node 22 satisfies Next.js 16.3.0's Node.js `>=20.9.0` requirement without introducing an application-runtime Node pin.

Each job restores the pnpm store through `actions/setup-node` and then runs:

```bash
pnpm install --frozen-lockfile
```

The frozen install makes package metadata and `pnpm-lock.yaml` disagreement a CI failure. The cache contains dependency-store data only; environment files, secrets, PostgreSQL data, and Next.js build output are not cached.

## Validation jobs and commands

The `quality` job executes the existing repository commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm db:check
```

Vitest's default configuration excludes `*.integration.test.ts`, so `pnpm test` remains the unit and non-database test suite. `pnpm db:check` validates the committed Drizzle schema and migration history only; it does not generate or apply a migration. The step runs with `NODE_ENV=production` and a syntactically valid, CI-only loopback URL on closed port 1. That prevents `drizzle.config.ts` from loading `.env.local` and makes any unexpected database connection fail closed instead of reaching persistent data.

The `integration` job executes:

```bash
pnpm test:integration
```

This reuses the repository's guarded integration runner rather than adding another database lifecycle. The runner resolves the Compose configuration, verifies that Development PostgreSQL retains its `postgres_data` named volume, verifies that `postgres-test` uses tmpfs and has no data-volume mount, and starts only the profiled `postgres-test` service. Tests receive the runner-owned `INTEGRATION_DATABASE_URL` for loopback port `55432` and enforce database `yolpol_integration` plus user `yolpol_test` before destructive cleanup. The runner removes only the disposable `postgres-test` container before and after the suite; it cannot issue `docker compose down`, remove volumes, or operate on the persistent Development service.

The `build` job executes a real production build:

```bash
pnpm build
```

The build produces validation output only. Nothing is uploaded or deployed.

## Secrets and permissions

The workflow grants the GitHub token only `contents: read`. It uses no repository or environment secrets and requires no Groq key, Telegram credentials, webhook secret, database credential, Staff credential, or Customer credential. The PostgreSQL values in the integration job are non-sensitive, fixed credentials scoped to the runner-local disposable container.

The workflow never checks out or loads the ignored `.env.local`. Production and Development credentials are neither referenced nor required.

## Triggers and concurrency

Validation runs for every pull request and for pushes to `develop` and `main`. The concurrency key separates pull requests and branch refs. A newer run supersedes an older run for the same pull request or branch, while unrelated pull requests and branches continue independently.

## Relationship to future delivery workflows

Future Staging or Production CI/CD should depend on this validation foundation, but deployment concerns belong in separately reviewed features and workflows with their own environments, permissions, credentials, approvals, rollback behavior, and audit trail. This workflow must remain a non-deployment correctness gate.
