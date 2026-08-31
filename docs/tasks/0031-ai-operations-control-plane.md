# AI Operations Control Plane

## Objective

Add a persistent, Staff-only control plane that determines whether future AI automation may become eligible to operate. This feature does not execute, route, schedule, translate, or call an AI provider.

## Security and behavior

- The persisted policy is a singleton with an optimistic-concurrency version.
- Missing, unreadable, or invalid policy state fails closed.
- `YOLPOL_AI_AUTOMATION_EMERGENCY_DISABLED=true` forces the effective state off. Invalid values also fail closed. The override cannot enable automation and is read-only in the UI.
- Super Administrators and Administrators may update the policy. Sales and Viewer roles may inspect status and audit history only.
- Staff identity is resolved from the HttpOnly session. The update API never accepts an actor identifier.
- Mutations require the existing exact-Origin policy, bounded JSON, a dedicated rate limiter, strict payload shape, and the current expected version.
- Each successful policy mutation and its immutable audit event are written in one database transaction.

## Domain model

`AiOperationsPolicy` owns:

- mode: `DISABLED`, `FALLBACK`, or `SCHEDULED`
- IANA business time zone
- human grace period in seconds, bounded from 60 to 86,400
- normalized schedule windows
- version, update time, and server-derived Staff actor reference

Schedule input uses ISO weekdays and minute-of-day values. Overnight input is normalized into two non-overnight rows. Zero-length, duplicate, and overlapping windows are rejected, and stored rows have deterministic order.

Policy evaluation returns a typed reason. `FALLBACK` means policy-level eligibility only; it does not select conversations or bypass the configured human grace period. `SCHEDULED` is eligible only inside a configured enabled window in the policy time zone.

## Persistence

The append-only migration introduces:

- `ai_operation_policy`
- `ai_schedule_windows`
- `ai_policy_events`

No existing migration is modified and no policy row is seeded. Audit snapshots are safe policy configuration values only; they contain no credentials, customer data, provider configuration, or browser-supplied identity.

## HTTP and UI

- `GET /api/staff/ai-operations`
- `PUT /api/staff/ai-operations`
- `GET /api/staff/ai-operations/audit`
- localized Staff page at `/{locale}/staff/ai-operations`

The UI distinguishes configured state from effective eligibility and explains that an allowed decision means only that future AI automation may become eligible. It exposes the emergency override as read-only state.

## Explicit exclusions

AI providers, prompts, model selection, conversation routing, timers, queues, jobs, agents, translation, Telegram behavior, additional channels, CRM changes, product or price changes, secret management, and automatic policy seeding are outside this task.
