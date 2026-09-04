# YolPol

YolPol is a multilingual, SEO-first B2B glass-bottle catalog built with Next.js. The application, PostgreSQL database, and future supporting services are intended for a private self-hosted server.

## Application setup

Install dependencies with `pnpm install`, copy `.env.example` to the ignored `.env.local`, and replace every example credential. Run `pnpm dev` for local-only access or `pnpm dev:host` to bind the Development server to `0.0.0.0` for LAN/mobile testing. Neither command starts a background worker.

## Local PostgreSQL

Start the persistent development database:

```powershell
docker compose up -d postgres
docker compose ps
```

Set `DATABASE_URL` in `.env.local`, then use the reviewed migration workflow. Drizzle loads the local Development environment automatically while preserving an already supplied process environment value:

```powershell
pnpm db:check
pnpm db:migrate
```

Generate a migration only after an intentional schema change with `pnpm db:generate`; commit and review the resulting SQL. Do not use runtime schema synchronization or `push` for production.

## Local workers

Run Development workers as separate, explicit processes with `pnpm dev:inquiry-notifications` and `pnpm dev:ai-fallback`. These commands load the ignored local Development environment before importing worker composition. The production-style `pnpm worker:inquiry-notifications` and `pnpm worker:ai-fallback` commands remain environment-only and do not load `.env.local`.

After a machine restart, the normal Development workflow requires no manual PowerShell environment exports:

```powershell
# Terminal 1
pnpm dev
# Or, for LAN/mobile access:
pnpm dev:host

# Terminal 2
pnpm dev:inquiry-notifications

# Terminal 3
pnpm dev:ai-fallback
```

`pnpm db:check` and the explicitly reviewed `pnpm db:migrate` command use the same local Development environment loading. Production application and worker processes continue to receive secrets through their process environment and/or Docker Secrets; they do not read `.env.local`.

## PostgreSQL integration tests

The integration database is intentionally separate, safety-guarded, and ephemeral. The command recreates only the integration container, waits for PostgreSQL health, applies committed migrations through the test setup, and removes that container afterward even when tests fail:

```powershell
pnpm test:integration
```

Do not point integration tests at the normal development or production database, and run only one integration suite at a time because it uses a fixed local port and database identity. The lifecycle runner does not remove the development service or volume.

## Self-hosted production direction

The application must reach PostgreSQL through an internal Docker network; port 5432 must not be exposed to the public internet. Production credentials must differ from development and integration credentials and must never be committed. Apply migrations as an explicit release step, and stop deployment when migration fails.

Before launch, implement encrypted backups stored outside the primary server and regularly test restores. The eventual production deployment also needs resource limits, health checks, monitored disk capacity, a production Dockerfile, reverse proxy, TLS, monitoring, and deployment automation. Future Umami and n8n services must use separate databases and database users and must never reuse YolPol application credentials.
