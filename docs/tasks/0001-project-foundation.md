# Task 0001: Project Foundation

- Status: Implemented
- Date: 2026-08-15

## Scope

Establish documentation, locale-prefixed next-intl routing, typed locale direction, four UI message sets, a minimal localized home page, localized metadata, robots and sitemap endpoints, and baseline quality scripts.

## Acceptance Criteria

- `/en`, `/tr`, `/fa`, and `/ar` are statically supported.
- English and Turkish documents are LTR; Persian and Arabic documents are RTL.
- UI strings and root metadata are localized.
- Canonical, hreflang, `x-default`, Open Graph, robots, and sitemap foundations exist.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.

## Exclusions

Product entities and repositories, databases, authentication, payments, CMS/admin capabilities, and customer acquisition automation are deferred.

## Launch Note

`https://example.com` is a placeholder site origin in `src/shared/config/site.ts`. Replace it only after the production domain is confirmed.
