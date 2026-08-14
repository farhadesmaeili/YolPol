# YolPol Architecture

## Purpose

YolPol is a multilingual, SEO-first B2B catalog built with the Next.js App Router. The foundation favors static Server Components, crawlable locale-prefixed URLs, and explicit boundaries that can grow with the product catalog.

## Structure

- `src/app` composes routes and framework metadata. Route files stay thin.
- `src/i18n` owns supported locales, message loading, locale-aware navigation, and request routing.
- `src/shared` contains cross-feature code only when it has a real consumer. Current modules hold site configuration and shared SEO metadata construction.
- Future business features belong under `src/features/<feature>`, split into `domain`, `application`, `infrastructure`, and `presentation` only where those layers solve a concrete need.

## Dependency Direction

Domain code is framework-independent. Application code may use domain abstractions. Infrastructure implements repository interfaces. Presentation invokes application use cases. App Router files compose presentation and framework concerns; they do not access product data directly.

## Rendering and Internationalization

English, Turkish, Persian, and Arabic use mandatory URL prefixes. The localized root layout validates the route locale, sets `lang` and text direction, loads messages on the server, and pre-generates locale parameters. Persian and Arabic render RTL; English and Turkish render LTR.

## SEO Foundation

Each localized home page has translated metadata, a canonical URL, locale alternates, `x-default`, and Open Graph fields. `robots.ts` and `sitemap.ts` use the shared site origin. The current origin is a documented placeholder and must be replaced before launch.

## Testing

Vitest covers framework-independent rules and application use cases. Lint, strict TypeScript checking, unit tests, and a production build are the required foundation checks.
