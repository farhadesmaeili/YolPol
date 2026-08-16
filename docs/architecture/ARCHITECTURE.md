# YolPol Architecture

## Customer Inquiry presentation boundary

The localized Inquiry route obtains narrow published Product options through composition and keeps interactive draft state in a focused Client Component. It produces application-compatible customer-owned values but performs no submission or persistence. Canonical contact and technical values use shared LTR isolation; localized human numbers use presentation-owned `Intl.NumberFormat`. Query preselection contains only a validated Product ID and does not alter the clean canonical URL.

## Export Logistics boundary

`src/features/export-logistics` follows the domain/application/infrastructure/presentation/testing feature structure. Its pure domain services own request validation, the 26-pallet and 26,000,000-gram policy, and checked integer arithmetic. An anti-corruption adapter receives Product application DTO queries by dependency injection; application mapping runtime-validates identity, publication status, locale, and packaging before creating trusted snapshots. Listing dependency failures use typed results. Product records and packaging values remain owned exclusively by the Product feature. A dedicated composition root owns wiring, while the App Router imports only that composition boundary. Interactive state and strict decimal input parsing are isolated to the pallet calculator presentation boundary.

## Purpose

YolPol is a multilingual, SEO-first B2B catalog built with the Next.js App Router. The foundation favors static Server Components, crawlable locale-prefixed URLs, and explicit boundaries that can grow with the product catalog.

## Structure

- `src/app` composes routes and framework metadata. Route files stay thin.
- `src/i18n` owns supported locales, message loading, locale-aware navigation, and request routing.
- `src/shared` contains cross-feature code only when it has a real consumer. Current modules hold site configuration and shared SEO metadata construction.
- `src/shared/presentation/site-shell` owns the global header, footer, and narrowly scoped interactive navigation. The shell is cross-cutting UI, not a business feature, so it does not receive artificial domain or infrastructure layers.
- Every business feature has permanent `domain`, `application`, `infrastructure`, `presentation`, and `testing` layers. Responsibility-based subdirectories own entities, value objects, ports, use cases, repositories, presenters, tests, and test utilities; empty directories are not created.

## Product Catalog Boundary

The product feature owns the `Product` aggregate, nominal value objects, repository contract, catalog use cases, static repository, presentation view models, and presenter. The aggregate keeps language-independent identity, multi-category classification, lifecycle, inquiry pricing, optional packaging, images, timestamps, and technical specifications separate from localized descriptive and SEO content.

The framework-independent locale type lives in `src/shared/types`. Domain and application code may use that type without importing next-intl. The i18n layer consumes the same locale definition so supported locales have one source of truth.

New products are created as drafts from primitive inputs. Existing records use an explicit reconstitution path that revalidates every invariant, including publication requirements. Status changes use aggregate transitions and cannot move timestamps backwards.

Product repository interfaces point inward and expose only the read operations required by the catalog. The static adapter validates global ID, SKU, slug, and product-locale uniqueness plus cross-record references. It stores frozen source snapshots and hydrates fresh aggregates per result, preventing callers from mutating repository state. A future CMS or database adapter can replace it without changing domain rules or application use cases.

Published products must include at least one unique supported category, valid English content, and at least one image with exactly one primary image. The current taxonomy is olive oil, food, beverage, and pharmaceutical. All nine verified Products belong to the first three categories; pharmaceutical remains available for future Products with no current assignment. Glass is the verified material for all nine current Products. Capacity, glass color, and bottle shape use typed technical values. Other technical specifications remain optional because verified data availability varies. Slugs are global and language-independent. Public listing copy must describe the categories assigned to the current published catalog rather than unused future taxonomy options.

Packaging is optional and stores units per package, packages per pallet, and gross pallet weight. Units per pallet is derived rather than persisted. Export truck planning is outside Product and belongs to a future `export-logistics` feature. Public pricing is inquiry-only; numeric IRR amounts are neither stored nor exposed. Any future visible-price model must define currency, basis, cap inclusion, and validity semantics.

Public listing fails closed to `published` when no status is supplied. Draft and archived listings require explicit status filters; a future administrative catalog should use a separate use case or authorization policy.

Application DTOs carry use-case data across the application boundary. Product view models group that data for stable presentation consumption, sort images deterministically, and preserve explicit query outcomes without fetching, translating, or adding business rules.

Localized Product routes call `src/composition/products`, which is the only boundary that wires the static repository, use cases, and presenter. App Router modules never import Product infrastructure. Product presentation owns Server Components, product metadata, verified Product/Breadcrumb JSON-LD, and sitemap mapping.

The production catalog contains nine verified Products, each with four localized records and one tracked primary WebP image. Detail routes return 404 for missing, non-published, or locale-unavailable products. The resulting 36 localized detail paths are statically generated with `dynamicParams = false`, so unknown slugs receive a real 404. Adding verified local records requires a rebuild. A future runtime CMS adapter must revisit this policy by enabling dynamic parameters or adopting an explicit dynamic-rendering or revalidation strategy.

## Dependency Direction

Dependencies flow `presentation → application → domain` and `infrastructure → application/domain`. Domain and application are framework-independent. Production code never imports testing utilities. App Router files compose presentation and framework concerns; they do not access infrastructure or product data directly.

## Rendering and Internationalization

English, Turkish, Persian, and Arabic use mandatory URL prefixes. The localized root layout validates the route locale, sets `lang` and text direction, loads messages on the server, and pre-generates locale parameters. Persian and Arabic render RTL; English and Turkish render LTR.

The localized root layout renders one shared header, one main landmark, and one shared footer. Server Components own the shell and localized content; the navigation controller is the only Client Component and exists for mobile-menu state, active-route state, and route-preserving locale switches. Non-localized brand, contact, social, and public navigation destinations live in typed shared configuration.

## SEO Foundation

Each localized home page has translated metadata, a canonical URL, locale alternates, `x-default`, and Open Graph fields. `robots.ts` and `sitemap.ts` use the centrally owned approved production origin, `https://yolpol.com`.

Product listing and detail metadata use the same centralized origin and localized URL helper. Product alternates include only locales with verified content. Generic JSON-LD serialization and script rendering live in shared presentation SEO; Product presentation and static content routes consume that shared implementation while retaining ownership of their feature-specific structured-data mapping. The sitemap contains localized home/listing pages plus published product detail URLs for each available locale; drafts, archived products, and unavailable locales are excluded through application/composition boundaries.

Static category pages call the Product composition root with an explicit category filter, preserving the published-only application policy. About and Contact remain thin App Router content routes. Category, About, and Contact pages use localized canonical, alternate, Open Graph, and Breadcrumb structured data. The sitemap also includes these localized static routes.

## Testing

Vitest covers framework-independent rules, repository adapters, and application use cases. Lint, strict TypeScript checking, unit tests, and a production build are the required checks.

## Customer Inquiry Foundation

The Inquiry aggregate owns customer contact and location data, privacy-consent evidence, one or more immutable localized Product snapshots, source context, lifecycle state, and timestamps. Its feature permanently contains `domain`, `application`, `infrastructure`, `presentation`, and `testing` layers. Creation accepts untrusted primitives and starts at `received`; reconstitution revalidates persisted state; lifecycle changes use an explicit forward-only transition policy.

Inquiry application code verifies Product selections through the Inquiry-owned `InquiryProductCatalog` port. A future composition adapter will translate the existing Product application boundary into trusted Product ID, SKU, global slug, publication, and localized-name facts. Every returned ID must equal the requested ID, and malformed or failed catalog responses become provider-independent dependency failures. Inquiry never imports Product aggregates or infrastructure.

`SubmitInquiry` persists the aggregate before requesting independent email and Telegram notifications. Persistence failure prevents notification attempts; notification failure preserves acceptance and returns the failed provider-independent channel names. This foundation does not claim transactional Outbox, retries, idempotency, or exactly-once delivery. The integration phase must add durable PostgreSQL-backed notification jobs or an equivalent Outbox/retry mechanism.

Infrastructure currently owns provider-independent persistence records, aggregate record mapping, and external-payload boundary validation only. The unknown-payload parser rejects unexpected keys and reconstructs fresh known primitive fields; semantic invariants remain in the domain. The application Clock owns both creation and consent timestamps. Source paths must begin with their matching locale and exclude dot segments, query strings, hashes, and unsafe encodings. It deliberately has no fake production repository. The public Inquiry preparation form does not invoke this submission workflow; activation still requires approved privacy copy and real integrations.
