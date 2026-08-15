# Task 0003: Product Catalog Presentation

- Status: Implemented
- Date: 2026-08-15

## Scope

Add localized Product listing/detail routes, framework-integrated Server Components, composition-root wiring, localized interface messages, metadata, structured data, sitemap integration, loading states, and localized 404 handling. Production product datasets remain empty.

## Request Flow

App Router routes validate locale/slug parameters and call `src/composition/products`. The composition root alone constructs the static repository, use cases, and Product presenter. Routes compose presentation components and never import infrastructure or static data.

## Rendering Behavior

- `/[locale]/products` invokes `ListProducts` without a status override, preserving its published-only default.
- An empty published catalog renders a localized server-rendered empty state with a locale-aware home link.
- `/[locale]/products/[slug]` returns 404 for invalid, missing, draft, archived, or locale-unavailable products.
- Product images use verified localized alternative text and deterministic presenter ordering.
- Listing/detail loading states contain no fabricated skeleton product data.

## SEO and Structured Data

Listing and found-detail metadata use the centralized placeholder site origin, localized canonicals, hreflang alternates, `x-default`, and Open Graph data. Product alternates are limited to locales with actual localized content.

Product and Breadcrumb JSON-LD are owned by Product presentation and render only for a found published product. Product JSON-LD contains verified visible name, description, SKU, category, URL, and images—never offers, prices, availability, reviews, ratings, or unsupported claims. Serialization escapes `<`.

The sitemap includes localized home and products pages plus published product URLs for each available locale. Empty production data yields no product detail entries. Known localized product slugs feed static parameters and `dynamicParams = false` rejects every path not generated at build time, guaranteeing a real 404 for unknown slugs. Adding verified local records therefore requires a rebuild. A future runtime CMS adapter must enable dynamic parameters or adopt an explicit dynamic-rendering or revalidation strategy before newly added paths can resolve without a rebuild.

## Testing and Validation

Vitest covers presenter/SEO/structured-data/sitemap behavior and public visibility. No React testing dependency was added; components are validated through TypeScript, lint, production build, and live rendered-route inspection.

## Deferred Work

Verified product entry, filtering, pagination, search, CMS/database integration, administration, authentication, and inquiry submission remain future work.
