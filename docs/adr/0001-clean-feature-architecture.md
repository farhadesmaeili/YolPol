# ADR 0001: Clean Feature Architecture

- Status: Accepted
- Date: 2026-08-15

## Context

YolPol will grow from a small local catalog into multiple business capabilities. Framework-coupled business rules would make content-source changes and isolated testing expensive.

## Decision

Organize business capabilities by feature. Within a feature, introduce domain, application, infrastructure, and presentation boundaries only when real behavior requires them. Dependencies point inward: domain remains framework-free, application targets domain abstractions, infrastructure implements repository contracts, and presentation calls use cases. App Router modules remain composition roots.

## Consequences

Business rules can be tested without Next.js, and a future content source can replace local data behind repository interfaces. The team must avoid both route-level business logic and speculative layers with no current consumer.
