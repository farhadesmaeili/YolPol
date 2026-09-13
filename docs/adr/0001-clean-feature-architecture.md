# ADR 0001: Clean Feature Architecture

- Status: Accepted
- Date: 2026-08-15

## Context

YolPol will grow from a small local catalog into multiple business capabilities. Framework-coupled business rules would make content-source changes and isolated testing expensive.

## Decision

Organize every business capability by feature with permanent `domain`, `application`, `infrastructure`, `presentation`, and `testing` layers. Within those layers, use responsibility-based subdirectories only when they contain real files.

Dependencies point inward: presentation uses application contracts, application uses domain, and infrastructure implements application ports using domain aggregates. Domain and application remain framework-independent. Production code never imports the testing layer, and App Router modules consume presentation/application boundaries rather than infrastructure.

Layer-owned tests live in each layer's `__tests__`; reusable fixtures, builders, and fakes live in the feature-level testing layer. Presentation is a real boundary even before React UI exists and may consist of framework-independent presenters and view models.

## Consequences

Business rules can be tested without Next.js, a future content source can replace local data behind repository interfaces, and UI models remain independent of persistence. Every feature has a consistent top-level shape, but empty directories and speculative files remain prohibited.
