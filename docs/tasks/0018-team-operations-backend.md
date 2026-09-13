# Team Operations Backend Foundation

## Purpose

This phase prepares framework-independent inquiry operations for a future authenticated staff panel. It adds bounded inquiry listing, inquiry detail, assignable-team-member listing, and a server-only composition boundary that reuses the existing assignment and lifecycle commands.

It does not add staff authentication, authorization, team-member provisioning, role management, or an admin-panel reply channel.

## Read model

Operational list and detail queries use a dedicated application read port rather than loading Inquiry aggregates and filtering them in memory. The PostgreSQL adapter projects explicit application read models and never returns raw rows. The list query selects a bounded page first, then enriches that page with item and latest-conversation summaries in one database round trip. Detail reuses the existing ordered workflow-history reader and conversation-message reader.

The read models intentionally exclude conversation access credentials, token lookup/hash values, notification Outbox internals, provider credentials, environment data, and internal Product prices.

## Pagination and filters

The inbox is ordered by `created_at DESC, id DESC`. Its cursor contains both values, so equal timestamps do not duplicate or omit Inquiries between pages. The application validates the cursor before persistence and caps page size at 100. Phase 1 supports lifecycle status, one assigned team member, or unassigned Inquiries. Filtering happens in PostgreSQL before the page is selected.

The current `inquiries_created_at_idx` remains usable for the leading sort column. This phase adds no migration or speculative index; production query plans and data volume should be measured before changing indexes.

## Security boundary

No `/api/team/*`, `/api/admin/*`, or other Team Operations HTTP route is exposed. The composition module is server-only, but that is not authentication. A future HTTP adapter must first establish real staff authentication and authorization and derive the workflow `actorReference` from the authenticated staff principal. It must never trust a browser-supplied actor reference.

Customer conversation tokens authenticate only the customer conversation capability and are not staff credentials. Telegram recipient authorization likewise does not establish a staff web session.

`inquiry_team_members` remains the provider-neutral operational identity used for assignment. `communication_recipients` remains a delivery/channel identity. They are not merged, and Telegram or email identifiers are not copied into `inquiry_team_members`.

## Deferred work

The next protected-panel phase must define staff principals, session management, authorization policy, CSRF/origin protections, authenticated route adapters, and audit-safe actor derivation. A provider-neutral internal-panel message command and channel semantics must be designed before adding staff replies; existing Telegram replies and customer website chat remain unchanged.
