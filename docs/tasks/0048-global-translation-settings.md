# Global Translation Settings

## Problem

Conversation translation automation was stored and presented only as a per-Conversation control. Staff need centrally managed defaults while retaining deliberate exceptions and the existing fail-closed Customer-language delivery guarantees.

## Architecture

The feature remains inside `conversation-translation` and preserves the established domain, application, infrastructure, presentation, and testing layers. Domain policy resolution is authoritative: an explicit Conversation override wins; otherwise the current persisted global defaults win; if the singleton global record is absent, the code-owned fallback is used. App Router pages and handlers remain thin composition consumers.

The two existing automatic scheduling boundaries—new Message scheduling and source-language confirmation—use the same effective-policy resolution helper. Translation provider selection, Registry/Gateway behavior, workers, Customer projections, Channel delivery, SSE cursors, reducer ordering, and immutable authored Message bodies are unchanged.

## Global defaults, overrides, and effective policy

The deterministic fallback global policy is:

- Customer to Staff: `AUTO`
- Staff to Customer: `AUTO`
- AI Agent to Staff: `ON_DEMAND`

`global_translation_settings` holds the optional singleton `GLOBAL` record with optimistic version, update time, and server-derived Staff actor. Absence is version `0` and causes no write. `global_translation_setting_events` records versioned, content-free before/after metadata and is append-only.

`conversation_translation_controls` now means an explicit Conversation override. Absence means inheritance. Staff can set all three override values or remove the override. Removal deletes only the current override row and appends a `REMOVE` control event; it does not delete historical events, translations, jobs, or Messages. Effective Staff DTOs expose the global snapshot, optional override snapshot, effective policy, and `GLOBAL | OVERRIDE` source explicitly.

## Backward compatibility

Every pre-existing `conversation_translation_controls` row already represented an explicit Staff-selected policy. Migration `0022_global_translation_settings.sql` preserves every such row and adds an event operation discriminator whose default marks historical events as `SET`. No data rewrite, mass update, table recreation, or Development seed/reset is performed. Existing explicit policies therefore remain stable after global-default changes. Conversations without a row inherit the new global fallback and future persisted changes.

## Concurrency and authorization

Global updates use optimistic versions and a transaction-scoped advisory lock so concurrent first writes cannot both win. Conversation override mutations retain the Conversation row lock used by message append and remediation paths; stale override versions conflict. Only authenticated `ADMIN` and `SUPER_ADMIN` principals may mutate global defaults. All authenticated Staff may read the page; non-administrators receive a read-only presentation. Conversation override mutation retains the existing non-Viewer Staff authorization and server-side Inquiry-to-Conversation lookup.

HTTP inputs are exact-key, bounded JSON; mutations enforce strict Origin checks and rate limiting. Actor references are derived from the authenticated Staff principal. DTOs and events contain no message content, Customer details, provider/model metadata, credentials, pricing, or other operational settings.

## Hard safety invariant

Automation policy never selects a Customer-visible body. An untranslated cross-language Staff Message is never sent directly to the Customer under either `AUTO` or `MANUAL`. The existing Customer-safe Website and external-channel projections remain unchanged and still require same-language authored content or a successful authoritative Customer-target translation.

## Staff UI

`/[locale]/staff/translation-settings` follows the existing localized Staff shell and provides three accessible directional controls with explanatory copy, inheritance semantics, and a non-toggle safety notice. The Conversation detail surface is reframed as “Override for this conversation”: it always shows effective values and source, lets authorized Staff create/edit an override, and can reset to current globals without dominating the Conversation screen.

## Tests and migration status

Focused domain, application, HTTP, persistence/migration, authorization, and presentation tests cover fallback and persisted globals, inheritance, live global changes, explicit override precedence, removal, historical-row preservation, optimistic concurrency, safe DTO shape, localization, and the unchanged delivery invariant. Existing translation-control and Customer-delivery suites remain part of final validation.

Migration generated: `drizzle/0022_global_translation_settings.sql`.

Migration applied to Development: **NO**.
