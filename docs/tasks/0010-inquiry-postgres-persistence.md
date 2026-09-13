# Task 0010: Customer Inquiry PostgreSQL Persistence

- Status: Implemented foundation
- Date: 2026-08-17

Adds a self-hosted PostgreSQL persistence adapter behind the existing `InquiryRepository` application port. Drizzle owns the typed Inquiry schema and committed SQL migrations; node-postgres owns a conservative server-side connection pool. Parent and ordered child rows persist atomically, duplicate IDs receive existing typed application behavior, and persisted primitives are revalidated through `Inquiry.reconstitute`.

Local development uses the pinned PostgreSQL Compose service and named `postgres_data` volume. Destructive integration isolation uses the separately identified `yolpol_integration` database on the opt-in `integration` profile. Its PostgreSQL data directory is a `tmpfs`; the cross-platform test runner holds an atomic repository-specific OS-temporary lock, recreates the disposable service, waits for its real health check, runs committed migrations and tests, then removes only that service container without removing volumes. Each run therefore begins with empty storage. Tests refuse unsafe database identities and never remove the normal development volume. The fixed local port and database identity require integration suites to run serially; a concurrent runner fails before Docker mutation. SIGINT and SIGTERM trigger bounded child termination, container cleanup, and lock release. Forced operating-system termination, machine shutdown, or Docker daemon failure cannot guarantee cleanup; the next run recovers only a lock whose recorded process is confirmed dead.

This task does not activate public Inquiry submission, notifications, abuse controls, analytics, retention deletion, a production Dockerfile, reverse proxy, TLS, monitoring, backups, Umami, or n8n.
