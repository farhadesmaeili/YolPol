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

Business features should follow this structure when appropriate:

- domain
- application
- infrastructure
- presentation

Dependency rules:

- Domain must not depend on React, Next.js, next-intl, UI libraries,
  databases, APIs, frameworks, or infrastructure.
- Application may depend on domain abstractions.
- Infrastructure implements domain repository interfaces.
- Presentation may call application use cases.
- App Router files must remain thin.
- Do not place business logic inside `page.tsx`, layouts, route handlers,
  or React components.
- Do not access product data directly from route components.
- Do not create abstractions without a real use case.

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