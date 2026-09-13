# Task 0005: Site Shell and Navigation

- Status: Implemented
- Date: 2026-08-15

## Scope and Route Map

This task adds the multilingual site shell and the localized routes `/[locale]/products/olive-oil`, `/[locale]/products/food`, `/[locale]/products/beverage`, `/[locale]/about`, and `/[locale]/contact`. English route segments remain stable in every locale. Existing home, catalog, and 36 Product detail routes are preserved.

## Shared Site Shell

The header and footer live in `src/shared/presentation/site-shell` because they are cross-cutting presentation UI rather than a business capability. Creating empty domain, application, infrastructure, or testing layers for them would provide no boundary or behavior. The localized root layout owns one header, one main landmark, and one footer.

The header renders the approved logo, primary navigation, active-route indication, four-locale switcher, and accessible mobile-menu button. The header and footer are Server Components. A small navigation Client Component owns only route state and mobile-menu state, closes the menu after navigation or Escape, restores trigger focus after Escape, and preserves the current pathname when switching locale. Query strings and hashes are intentionally not preserved because current routes do not use them; this must be revisited with future query-driven filtering, sorting, pagination, or anchored navigation.

The footer provides factual localized brand copy, internal navigation, current public categories, centralized contact information, approved social links, and the current copyright year. Contact and social destinations are defined once in typed shared configuration; localized labels remain in next-intl messages.

## Category Composition and SEO

The three static category folders take precedence over the existing Product slug route. Their shared route adapter calls `listProductCatalog` through the composition root with an explicit category. `ListProducts` continues to default to published status, and ProductPresenter supplies the existing grid view models. Pharmaceutical remains supported by the Product taxonomy but has no current public route or navigation entry.

Category, About, and Contact pages provide localized titles, descriptions, canonical URLs, four locale alternates, English `x-default`, Open Graph metadata, and Breadcrumb JSON-LD. Generic safe JSON-LD serialization and rendering belong to shared presentation SEO; Product presentation consumes the same implementation without reversing the shared dependency direction. Product JSON-LD remains exclusive to detail pages. The sitemap contains 28 localized static URLs and the existing 36 Product detail URLs, totaling 64 unique URLs.

## Direction and Responsive Behavior

The existing localized layout continues to set `lang` and `dir`. Shell layouts use logical flow, wrapping, and direction-neutral gaps so English/Turkish render LTR and Persian/Arabic render RTL. The mobile menu uses a real button with localized accessible names, `aria-expanded`, and `aria-controls`.

## Validation

Tests directly cover safe shared JSON-LD rendering, mixed-category composition forwarding with published-only status, actual localized category/About/Contact metadata boundaries, and the complete expected sitemap URL set. ESLint, strict TypeScript checking, all 138 Vitest tests across 13 files, and the Next.js production build pass. The build generates 69 static pages. Rendered production-route inspection covers all locales, the shell landmarks, contact destinations, structured data, the 64-URL sitemap, and unknown Product 404 behavior.

## Deferred Work

The privacy page, activated quotation workflow, content-managed sources, search, filtering controls, analytics, and deployment remain deferred. The production origin was subsequently approved as `https://yolpol.com` in Task 0006. No form submission, API route, database, CRM, logistics, pricing, inventory, or authentication capability is introduced.
