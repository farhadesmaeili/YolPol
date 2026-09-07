# Conversation Translation Control

## Purpose

Conversation Translation Control lets authorized Staff decide when translation provider work is worth its token and API cost without weakening Customer-language delivery. The policy is stored per Conversation and has three deliberately distinct directions. There is no generic `OFF` mode.

## Directional policy

- Customer to Staff: `AUTO` schedules the existing Staff-working-language convenience translation when a Customer message is created. `MANUAL` keeps the original visible to Staff and waits for an explicit Translate action.
- Staff to Customer: `AUTO` schedules the required authoritative Customer-locale translation for a cross-language Staff reply. `MANUAL` waits for an explicit Translate action while Customer delivery remains blocked.
- AI Agent to Staff: `AUTO` schedules the Staff-working-language convenience translation. `ON_DEMAND` keeps the Customer-locale AI response visible to Staff and waits for an explicit Translate for Staff action.

The effective default is `AUTO/AUTO/AUTO`, including Conversations created before this migration. A missing control row means those defaults and version `0`, so deployment preserves existing behavior. A future global-default feature may change how new Conversations are initialized, but it is outside this task.

## Hard Customer delivery invariant

MANUAL never means "send untranslated Staff source text". A cross-language Staff reply remains in the immutable authored Message record, but Website projection and Conversation Channel Foundation delivery both continue to reject it while the Customer-target translation is missing, pending, failed, or cancelled. They use only a successful authoritative Customer-locale translation. Same-language Staff and Customer content remains eligible under the existing rules.

AI Agent output is already authored in the authoritative Customer locale. It remains Customer-deliverable regardless of the AI-to-Staff convenience mode. AI-to-Staff `ON_DEMAND` exists to avoid unnecessary translation provider/token consumption and does not route AI output through the Staff-to-Customer policy.

## Durable model and concurrency

`conversation_translation_controls` stores the three modes, an optimistic version, update time, and a server-derived Staff actor reference. `conversation_translation_control_events` is append-only audit metadata containing old/new modes and versions without message bodies, provider details, credentials, or pricing.

Control updates, message append scheduling, and explicit translation requests lock the same Conversation row. This linearizes message/mode races: the mode observed while a message is appended controls that message's automatic scheduling. Mode changes affect future scheduling only. Existing queued, running, and completed translations are retained and reusable; a worker already holding a job is not cancelled by a later mode change.

## Manual translation action

The Staff-only action accepts Conversation/Inquiry and Message identities plus the current message-language version. It does not accept target locale, provider, model, credential, sender identity, or authored body. Persistence verifies that the Message belongs to the Conversation and derives the only eligible target:

- Customer Message: Staff working locale.
- Staff Message: authoritative Customer locale.
- AI Agent Message: Staff working locale.

The existing `(message_id, target_locale)` translation identity, unique constraints, and Conversation lock make repeated clicks, two-Staff clicks, and AUTO/manual races idempotent. An existing pending/running job or completed translation is reused. Existing failure retry continues through the established remediation action.

Returning to AUTO does not backfill older messages. Eligible messages without a translation therefore retain their explicit Translate action in every mode. The control panel renders the latest server snapshot after refresh, including changes made by another Staff member.

## Staff UI

The Inquiry detail screen shows a compact localized control panel for all three directions. Message presentation distinguishes an unscheduled manual/on-demand translation from a queued/running translation, offers Translate for Staff or Translate for Customer as appropriate, and states that an AI response already matches the Customer language. State is server-read, survives refresh, supports `en`, `tr`, `fa`, and `ar`, uses logical spacing, and exposes pressed/disabled state to assistive technology.

## Boundaries

Translation still uses the existing Translation worker and provider-neutral Registry/Gateway `TRANSLATION` capability. Original Conversation Message bodies are never changed. Website and external-channel safety remain independent of automation policy. This feature adds no provider UI, provider redesign, channel implementation, credential handling, price data, quotation flow, or global stop mode.
