# YolPol

YolPol is a multilingual, SEO-first B2B glass-bottle catalog built with Next.js. The application, PostgreSQL database, and future supporting services are intended for a private self-hosted server.

## Application setup

Install dependencies with `pnpm install`, then run `pnpm dev`. Copy `.env.example` to an ignored local environment file and replace every example credential.

## Local PostgreSQL

Start the persistent development database:

```powershell
docker compose up -d postgres
docker compose ps
```

Set `DATABASE_URL`, then use the reviewed migration workflow:

```powershell
pnpm db:check
pnpm db:migrate
```

Generate a migration only after an intentional schema change with `pnpm db:generate`; commit and review the resulting SQL. Do not use runtime schema synchronization or `push` for production.

## PostgreSQL integration tests

The integration database is intentionally separate, safety-guarded, and ephemeral. The command recreates only the integration container, waits for PostgreSQL health, applies committed migrations through the test setup, and removes that container afterward even when tests fail:

```powershell
pnpm test:integration
```

Do not point integration tests at the normal development or production database, and run only one integration suite at a time because it uses a fixed local port and database identity. The lifecycle runner does not remove the development service or volume.

## Self-hosted production direction

The application must reach PostgreSQL through an internal Docker network; port 5432 must not be exposed to the public internet. Production credentials must differ from development and integration credentials and must never be committed. Apply migrations as an explicit release step, and stop deployment when migration fails.

Before launch, implement encrypted backups stored outside the primary server and regularly test restores. The eventual production deployment also needs resource limits, health checks, monitored disk capacity, a production Dockerfile, reverse proxy, TLS, monitoring, and deployment automation. Future Umami and n8n services must use separate databases and database users and must never reuse YolPol application credentials.
