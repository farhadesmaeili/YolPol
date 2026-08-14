# Task 0002: Product Catalog Domain

- Status: Implemented
- Date: 2026-08-15

## Scope

Implement the first framework-independent product aggregate, read repository contract, catalog query use cases, empty-by-default static repository, and presentation mapping boundary. Product routes and React UI remain outside this task.

The feature permanently uses `domain`, `application`, `infrastructure`, `presentation`, and `testing` layers with responsibility-based subdirectories. Layer behavior tests stay with their owners; reusable fixtures, builders, and fakes stay under `testing`.

## Aggregate Boundary

`Product` owns identity, SKU, global language-independent slug, category, lifecycle status, optional technical specifications, images, localized content, and timestamps. Product ID, SKU, slug, and name are nominal, runtime-frozen value objects.

`Product.create` accepts primitives and always creates a draft with equal creation/update timestamps. `Product.reconstitute` restores draft, published, or archived persisted state while revalidating every invariant. `transitionTo` is the only supported lifecycle mutation and rejects backwards timestamps; same-status transitions are timestamp-preserving no-ops.

Technical fields are language-independent. Names, descriptions, applications, SEO copy, and image alternative text are keyed by locale and stored separately at the static-data boundary.

## Publication Policy

A product can be published only when it has:

- Complete English localized content, including SEO fields and at least one application
- At least one product image
- Exactly one primary product image

Optional technical specifications are not publication requirements. Product data must never be filled with invented values merely to satisfy publication.

Allowed transitions are `draft → published`, `draft → archived`, `published → archived`, and `archived → draft`. Reapplying the current status is a no-op. Other transitions are rejected explicitly.

## Repository Direction

Application use cases depend on the product repository port. Public listing defaults to published products; draft and archived results require explicit status filters. A future administrative listing must use a separate explicit use case or authorization policy.

The static adapter combines language-independent and localized records. It rejects duplicate IDs, normalized SKUs, global slugs, product-locale records, orphan localized records, and technical records without content. It snapshots source records and reconstitutes a fresh aggregate for every result, so callers cannot mutate repository state. Production data remains empty; tests provide fixtures.

A future CMS or database integration should implement the same port and perform boundary validation before constructing aggregates. Domain and application modules must remain unaware of the persistence technology.

## Presentation Boundary

Application DTOs represent use-case output. The framework-independent presenter converts those DTOs and explicit query results into grouped presentation view models with deterministically ordered images. It does not fetch, translate, generate URLs, or apply business rules.

## Acceptance Criteria

- Domain values and aggregate invariants return explicit domain errors.
- Slug lookup and list use cases return DTOs rather than aggregates or infrastructure records.
- Missing products and unavailable locales are explicit application results.
- Category and publication-status filters work in the repository and use case.
- Domain, use-case, and repository behavior has meaningful unit coverage.
- Nominal values, repository isolation, dataset integrity, visibility defaults, and presenter behavior have focused tests.
- Lint, typecheck, tests, and production build pass.

## Deferred Work

Product UI, real catalog content, product JSON-LD, CMS/database adapters, mutation workflows, authentication, and automation remain future tasks.
