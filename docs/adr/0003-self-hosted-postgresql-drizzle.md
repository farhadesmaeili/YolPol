# ADR 0003: Self-Hosted PostgreSQL with Drizzle and node-postgres

- Status: Accepted
- Date: 2026-08-17

## Context

Customer Inquiries are durable relational aggregates containing consent evidence, lifecycle state, timestamps, and ordered Product snapshots. YolPol will run the Next.js application and PostgreSQL on infrastructure controlled by YolPol rather than Vercel or a managed database provider.

## Decision

Use self-hosted PostgreSQL, stable Drizzle ORM, and node-postgres (`pg`). Inquiry infrastructure owns the relational schema, explicit row mapping, migrations, connection pool, and the concrete implementation of the existing application repository port. Composition constructs the adapter lazily; public routes and static builds do not connect to PostgreSQL.

PostgreSQL fits parent/child Inquiry data, atomic transactions, constraints, and deterministic queries. Drizzle provides typed schema/query construction while retaining reviewable SQL migrations. node-postgres provides the mature connection pool and transaction driver used by the Drizzle adapter.

MongoDB was not selected because the aggregate has relational child ordering, uniqueness, and transactional integrity requirements. Prisma was not selected because Drizzle supplies the required typed mapping and migration workflow with a smaller persistence boundary. Raw SQL alone was not selected because it would duplicate schema and row typing, although committed SQL migrations remain the deployment authority.

Closed domain values use check-constrained text rather than PostgreSQL enums so future domain evolution can use ordinary reviewed migrations without enum-specific migration coupling. Migrations are generated, committed, reviewed, and applied explicitly during deployment; application startup never mutates schema. Saving an Inquiry and its items is one transaction, and duplicate IDs never overwrite existing data.

## Consequences

Production requires private networking, secret management, migration gating, monitoring, capacity planning, backups, and tested restores. The database port must not be public. Future Umami and n8n installations require separate databases and users. Reconsider this decision if operational constraints or query requirements materially change; do not add a second repository abstraction meanwhile.
