# YolPol Repository Instructions

## Project Overview

YolPol is a multilingual, SEO-first B2B product catalog for introducing
and exporting beverage and pharmaceutical glass bottles.

Supported locales:

- English: `en`
- Turkish: `tr`
- Persian: `fa`
- Arabic: `ar`

The default locale is `en`.

Persian and Arabic must use RTL direction.
English and Turkish must use LTR direction.

## Technology

- Next.js App Router
- React
- TypeScript strict mode
- Tailwind CSS
- pnpm
- next-intl
- Zod
- Vitest for unit tests
- Playwright for end-to-end tests

Inspect the installed versions before changing configuration.
Preserve the existing package manager and project setup.

## Architecture

Use:

- Clean Architecture
- Feature-Based Architecture
- Domain-Driven Design principles where useful
- SOLID principles
- Repository Pattern
- Test-first development
- Documentation-first development
- Security by design

Every business feature must use these five top-level layers:

- `domain`
- `application`
- `infrastructure`
- `presentation`
- `testing`

Organize each layer with responsibility-based subdirectories such as
`entities`, `value-objects`, `errors`, `types`, `use-cases`, `dto`,
`ports`, `mappers`, `repositories`, `presenters`, `view-models`,
`fixtures`, `builders`, `fakes`, and `__tests__`. Create a directory only
when it contains a real file, and do not leave unrelated files loose at a
layer root.

Dependency rules:

- Dependencies flow `presentation → application → domain` and
  `infrastructure → application/domain`.
- Domain must not depend on application, infrastructure, presentation,
  testing, React, Next.js, next-intl, Zod, Node.js APIs, UI libraries,
  databases, APIs, or frameworks.
- Application may depend on domain and framework-independent shared types,
  but not infrastructure, presentation, React, Next.js, or next-intl.
- Infrastructure implements application ports and must not leak into
  presentation or App Router consumers.
- Presentation is required and must contain a real presenter, view model,
  component, or adapter appropriate to the feature. It may depend on
  application, but not infrastructure.
- Production code must never import feature testing utilities.
- Layer behavior tests belong in that layer's `__tests__`; reusable test
  fixtures, builders, and fakes belong in the feature-level `testing` layer.
- When moving files, update imports, remove obsolete locations, and inspect
  the final feature tree for misplaced or loose files.
- App Router files must remain thin.
- App Router files consume explicit composition roots and must never wire or
  import feature infrastructure directly.
- Do not place business logic inside `page.tsx`, layouts, route handlers,
  or React components.
- Do not access product data directly from route components.
- Do not create abstractions without a real use case.
- Feature-specific metadata and structured-data mapping belong to the
  feature presentation layer. JSON-LD may contain only verified data that is
  consistent with visible page content.

## Next.js Rules

- Use the App Router.
- Prefer Server Components.
- Add `"use client"` only when browser APIs, event handlers, or client
  state are required.
- Use `next/image` for product images.
- Use locale-aware navigation from next-intl.
- For Next.js 16 and newer, use `proxy.ts`, not `middleware.ts`.
- Keep route components focused on composition.
- Use the `@/*` alias for imports from `src`.
- Avoid `any`.
- Do not suppress TypeScript or ESLint errors without explaining why.

## Internationalization

Use next-intl with locale-prefixed routes:

- `/en`
- `/tr`
- `/fa`
- `/ar`

Use:

- `src/i18n/routing.ts`
- `src/i18n/navigation.ts`
- `src/i18n/request.ts`
- `src/i18n/messages/en.json`
- `src/i18n/messages/tr.json`
- `src/i18n/messages/fa.json`
- `src/i18n/messages/ar.json`
- `src/proxy.ts`

Keep interface translations separate from product content.

Do not hardcode user-facing text inside components.

The root localized layout must set the correct `lang` and `dir`
attributes.

## SEO Requirements

SEO is a core requirement, not an optional enhancement.

Every indexable page must eventually include:

- A unique localized title
- A unique localized description
- A canonical URL
- hreflang alternate URLs
- An `x-default` alternate
- Correct `lang` and `dir`
- One meaningful H1
- Semantic heading hierarchy
- Crawlable internal links
- Localized image alt text
- Open Graph metadata

The project must support:

- `robots.ts`
- `sitemap.ts`
- Organization JSON-LD
- Product JSON-LD
- BreadcrumbList JSON-LD

Never generate fake prices, reviews, ratings, availability, certificates,
or technical specifications.

Never fabricate production catalog records to demonstrate presentation.

## Product Content

The initial product source will be local typed data.

Product content must be separated by locale and accessed through a
repository abstraction.

The initial implementation must not add:

- A database
- Prisma
- Authentication
- Payments
- An admin dashboard
- A CMS
- Customer acquisition automation

These will be considered in later phases.

## Testing

Add tests for business rules and application use cases.

Before completing a task, run all available relevant checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
