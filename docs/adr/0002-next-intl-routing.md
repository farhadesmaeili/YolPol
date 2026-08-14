# ADR 0002: next-intl Locale-Prefixed Routing

- Status: Accepted
- Date: 2026-08-15

## Context

All four language versions must be independently crawlable, and the default English locale must also have a URL prefix. Persian and Arabic require RTL document direction.

## Decision

Use next-intl with `localePrefix: "always"` for `en`, `tr`, `fa`, and `ar`. Use English as the default locale. Next.js 16 request routing is handled by `src/proxy.ts`. A localized root layout validates locales, statically enumerates them, loads messages, and sets document language and direction.

## Consequences

Public routes are consistently prefixed and metadata can produce deterministic canonical and alternate URLs. Adding a locale requires updating typed routing, translations, direction rules when applicable, and localized content.
