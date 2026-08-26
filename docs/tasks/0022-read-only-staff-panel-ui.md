# Read-only Staff Panel UI

## Scope

This phase adds the first localized YOLPOL Staff operations interface. It is deliberately read-only: it adds no status, assignment, reply, account, Product-pricing, Telegram, AI, or other mutation capability and requires no database migration.

## Routes and localization

The interface follows the existing mandatory locale prefix and is available at `/{locale}/staff/login`, `/{locale}/staff`, `/{locale}/staff/inquiries`, `/{locale}/staff/inquiries/[inquiryId]`, and `/{locale}/staff/team` for `en`, `tr`, `fa`, and `ar`. Existing APIs remain non-localized under `/api/staff/*`. Staff pages use private generic metadata with `noindex`, `nofollow`, and no customer data; they are not added to the sitemap.

The locale root continues to own `lang`, typography, and `dir`. Staff components use logical spacing and borders, locale-aware UTC date formatting, LTR isolation for operational identifiers, and mirrored/readable layouts in Persian and Arabic. The public site frame detects Staff paths and does not render the public header, footer, or public navigation around the operational shell.

## Authentication and trusted identity

The `StaffPanel` composition root reads only the existing environment-specific HttpOnly Staff cookie on the server. It passes that opaque credential to the existing `ResolveStaffSession` use case, then applies the existing `StaffAuthorizationPolicy`. The resulting `StaffPrincipal` remains server-derived and supplies only the safe identity needed by the shell. Missing or invalid sessions redirect to the localized login route before protected output is returned. A resolved principal without Team Operations authorization receives a localized forbidden state, while dependency failures receive a safe service-unavailable state.

Login and logout Client Components call the existing `POST /api/staff/auth/login` and `POST /api/staff/auth/logout` routes through same-origin `fetch`. They show generic localized failures, navigate only to fixed localized Staff paths, and never read, write, expose, or persist the session cookie or response credentials. Passwords exist only in the form and request body and are not logged or stored in browser storage.

## Read composition and confidentiality

Authenticated Server Components use the existing server-only Team Operations composition directly instead of making HTTP requests back into the same Next.js process. React request memoization shares Staff access resolution between the protected layout and page. Pages then invoke `ListTeamInquiries`, `GetTeamInquiryDetail`, and `ListAssignableTeamMembers`; the existing protected HTTP APIs remain available for future browser interactions but are not duplicated.

The dashboard uses a five-record Inquiry preview and Staff identity only. The Inquiry queue supports URL-driven status and assignment filters, including unassigned records, and preserves the existing opaque forward keyset cursor. The UI offers a Next action; browser Back restores previous cursor URLs without inventing reverse cursors or offset pagination. Invalid UI parameters are ignored with a safe localized notice, and malformed application cursors fall back to the first filtered page.

Inquiry detail renders overview, customer/contact information, locations, plain-text customer message, ordered items, immutable workflow history, and read-only conversation messages. The Team page renders only active assignable Team Member display names, IDs, and active state. No DTO or component includes internal Product prices, Staff or customer credentials/digests, communication-recipient identifiers, Outbox internals, secrets, or database details. Customer-generated text is rendered through ordinary React text nodes; arbitrary HTML and linkification are not used.

## Rendering, caching, mobile, and deferred work

The Staff route subtree is `force-dynamic` with zero revalidation. Operational reads use direct uncached PostgreSQL-backed use cases, and no authenticated result is placed in public cache state. Loading, empty, invalid-filter, not-found, forbidden, dependency-failure, login-error, and logout-error states are localized.

The operational shell uses a compact desktop rail and a wrapping three-item mobile navigation. Inquiry tables become semantic stacked cards below the medium breakpoint; filters and detail sections stack without fixed widths, while long identifiers, emails, SKUs, and customer text wrap safely. Animations are limited to lightweight loading and transition feedback with reduced-motion handling.

Mutations remain deferred until separately reviewed command APIs can preserve Origin/CSRF enforcement, server-derived actor attribution, optimistic concurrency, audit history, and command-specific authorization. This phase does not provision accounts, perform a real Staff login, alter development sessions, touch PostgreSQL data, or add/modify migrations.
