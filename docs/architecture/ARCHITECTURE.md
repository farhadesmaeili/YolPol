# YolPol Architecture

## Purpose

YolPol is a multilingual, SEO-first B2B catalog built with the Next.js App Router. The foundation favors static Server Components, crawlable locale-prefixed URLs, and explicit boundaries that can grow with the product catalog.

## Structure

- `src/app` composes routes and framework metadata. Route files stay thin.
- `src/i18n` owns supported locales, message loading, locale-aware navigation, and request routing.
- `src/shared` contains cross-feature code only when it has a real consumer. Current modules hold site configuration and shared SEO metadata construction.
- Every business feature has permanent `domain`, `application`, `infrastructure`, `presentation`, and `testing` layers. Responsibility-based subdirectories own entities, value objects, ports, use cases, repositories, presenters, tests, and test utilities; empty directories are not created.

## Product Catalog Boundary

The product feature owns the `Product` aggregate, nominal value objects, repository contract, catalog use cases, static repository, presentation view models, and presenter. The aggregate keeps language-independent identity, classification, lifecycle, images, timestamps, and technical specifications separate from localized descriptive and SEO content.

The framework-independent locale type lives in `src/shared/types`. Domain and application code may use that type without importing next-intl. The i18n layer consumes the same locale definition so supported locales have one source of truth.

New products are created as drafts from primitive inputs. Existing records use an explicit reconstitution path that revalidates every invariant, including publication requirements. Status changes use aggregate transitions and cannot move timestamps backwards.

Product repository interfaces point inward and expose only the read operations required by the catalog. The static adapter validates global ID, SKU, slug, and product-locale uniqueness plus cross-record references. It stores frozen source snapshots and hydrates fresh aggregates per result, preventing callers from mutating repository state. A future CMS or database adapter can replace it without changing domain rules or application use cases.

Published products must include valid English content and at least one image with exactly one primary image. Optional technical specifications remain optional because product data availability varies. Slugs are currently global and language-independent. Other locales may be added independently; use cases return locale-unavailable results instead of silently mixing languages.

Public listing fails closed to `published` when no status is supplied. Draft and archived listings require explicit status filters; a future administrative catalog should use a separate use case or authorization policy.

Application DTOs carry use-case data across the application boundary. Product view models group that data for stable presentation consumption, sort images deterministically, and preserve explicit query outcomes without fetching, translating, or adding business rules.

Localized Product routes call `src/composition/products`, which is the only boundary that wires the static repository, use cases, and presenter. App Router modules never import Product infrastructure. Product presentation owns Server Components, product metadata, verified Product/Breadcrumb JSON-LD, and sitemap mapping.

The production catalog remains empty and the listing renders a localized, crawlable empty state. Detail routes return 404 for missing, non-published, or locale-unavailable products. Known published localized slugs are statically generated with `dynamicParams = false`, so unknown slugs receive a real 404 instead of entering a streamed fallback. Adding verified local records requires a rebuild to generate their paths. A future runtime CMS adapter must revisit this policy by enabling dynamic parameters or adopting an explicit dynamic-rendering or revalidation strategy.

## Dependency Direction

Dependencies flow `presentation → application → domain` and `infrastructure → application/domain`. Domain and application are framework-independent. Production code never imports testing utilities. App Router files compose presentation and framework concerns; they do not access infrastructure or product data directly.

## Rendering and Internationalization

English, Turkish, Persian, and Arabic use mandatory URL prefixes. The localized root layout validates the route locale, sets `lang` and text direction, loads messages on the server, and pre-generates locale parameters. Persian and Arabic render RTL; English and Turkish render LTR.

## SEO Foundation

Each localized home page has translated metadata, a canonical URL, locale alternates, `x-default`, and Open Graph fields. `robots.ts` and `sitemap.ts` use the shared site origin. The current origin is a documented placeholder and must be replaced before launch.

Product listing and detail metadata use the same centralized origin and localized URL helper. Product alternates include only locales with verified content. The sitemap contains localized home/listing pages plus published product detail URLs for each available locale; drafts, archived products, and unavailable locales are excluded through application/composition boundaries.

## Testing

Vitest covers framework-independent rules, repository adapters, and application use cases. Lint, strict TypeScript checking, unit tests, and a production build are the required checks.
