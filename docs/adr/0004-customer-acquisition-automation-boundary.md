# ADR 0004: Isolated Customer Acquisition and n8n Orchestration

- Status: Accepted for the Task 0082 local foundation
- Date: 2026-10-08

## Context

Company acquisition has different provenance, identity, qualification and suppression
rules from inbound Inquiries and Conversations. Workflow definitions must not become
the authoritative business model or obtain the existing application's database access.

## Decision

Keep a five-layer `customer-acquisition` feature in this repository, composed into a
dedicated Node.js HTTP service. Use existing TypeScript, Drizzle, node-postgres and
Vitest conventions without another web framework. Deploy locally through
`deploy/customer-acquisition`, including a dedicated Dockerfile.

n8n owns workflows and execution state in its own PostgreSQL container. The
acquisition service owns business data in another PostgreSQL container, with separate
runtime and migration roles. n8n can call only a narrow authenticated HTTP contract;
it receives neither acquisition nor main application database credentials. All
subsystem networks are explicit and internal; only the editor is loopback-published.

Migrations use a separate configuration/history and an explicit operation. Main
application Compose, Dockerfile, schema, migrations, release and bootstrap contracts
remain unchanged. The foundation processes synthetic observations only and provides
no send/discovery/provider capability. Authentication uses an independent file-backed
opaque credential. No acquisition endpoint is added to the public Next.js application.

## Consequences

Additional local processes are accepted for independent database, credential and
network boundaries. Production capacity, backups, recovery and operational integration
remain separate work. Future AI and Telegram integrations must use narrow contracts
with the existing YOLPOL owners, without copying their provider architecture or
exposing database credentials to n8n. Main application deployment does not activate
this subsystem.
