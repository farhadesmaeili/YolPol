# Telegram Staff Onboarding

## Feature status

Phase A established the domain, application, persistence, security, and token foundation. Phase B added the application-facing workflow. Phase C applied migration 0013 to Development and verified the complete self-connect, reply, disconnect, and reconnect lifecycle against the real Telegram bot.

The authenticated Staff dashboard now contains the self-service connection card. The HTTP surface is:

- `GET /api/staff/telegram`
- `POST /api/staff/telegram/connection-request`
- `POST /api/staff/telegram/connection-request/revoke`
- `POST /api/staff/telegram/disconnect`
- `POST /api/staff/team/accounts/:staffAccountId/telegram/disconnect`
- `POST /api/staff/team/accounts/:staffAccountId/telegram/connection-request/revoke`

Mutations use the current Staff session, strict Origin checks, bounded exact-empty JSON bodies, and `no-store` responses. Self-service never accepts a target identity. The safe status projection is only `NOT_CONNECTED`, `PENDING` with expiry, or `CONNECTED`. The issuance response is the only response containing the raw token; the browser reduces it to the validated `t.me` link and expiry held in component memory. A reload therefore shows pending state without reconstructing the link and offers cancel or fresh issuance.

`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is public-safe, strictly validated, and used server-side to construct only `https://t.me/<username>?start=<token>`. The bot token remains server-only.

## Security model

Telegram human identity and Telegram delivery policy are separate:

- `message.from.id` is the canonical Telegram User ID used to identify a person.
- A verified private `message.chat.id` is the private Chat ID used as a delivery destination.
- The values are stored separately as PostgreSQL `bigint` values and represented as validated decimal strings outside infrastructure so JavaScript number precision is never involved.
- Telegram usernames and profile metadata are mutable and are not stored or trusted.
- Telegram group membership is not Staff authorization, and `TEAM_GROUP` can never be a human actor.
- `communication_recipients` remains delivery-policy configuration. Connecting Telegram does not create or update a recipient and does not enable notifications.

Operational authorization is resolved dynamically:

`Telegram User ID -> active TelegramStaffLink -> active Team Member -> active Staff Account -> current role -> current capability`

Links contain no role or capability snapshot. A role change therefore applies immediately. Inactive Staff Accounts, inactive Team Members, and disconnected links cannot resolve an operational actor. A linked VIEWER remains a known Staff identity but does not gain reply capability.

## Connection proof

Only the authenticated Staff principal can create a connection request, and ownership identifiers are derived from that principal. Managers cannot connect or reconnect another person's Telegram account.

Tokens use `ypt_` plus a 32-byte base64url credential (47 characters total, within Telegram's 64-character deep-link parameter limit). The raw token is returned once at issuance and is never persisted. Persistence stores distinct, domain-separated SHA-256 lookup and verification digests. Verification uses fixed-length timing-safe comparison.

Requests last 10 minutes. Consumption locks the digest-matched request before sampling PostgreSQL `clock_timestamp()`, then checks terminal state, expiry, current Staff/Team Member activation, digest verification, and ownership within one transaction. Replays, malformed, expired, revoked, and unavailable requests return a neutral result.

Creating a request transactionally revokes any prior outstanding request for the same Staff identity. Self cancellation and manager revocation preserve request history.

## Link lifecycle and ownership

A successful proof creates or reconnects a `TelegramStaffLink`. Disconnect is non-destructive. Reconnecting the same Staff member to the same Telegram User reactivates the historical row. A different never-before-owned Telegram User is allowed only after the active link is disconnected.

Telegram User ownership is permanently unique across historical link rows, so self-service cannot transfer an identity between Staff members. Partial unique indexes enforce at most one active link per Team Member and at most one active private Chat ID. No migration DML copies `communication_recipients.external_id`; existing recipient rows remain unchanged.

## Manager controls

Administrative mutations reuse the Staff Team Management target policy and authorize before link/request state is inspected:

- `SUPER_ADMIN` may force-disconnect or revoke an outstanding request for another permitted Staff member.
- `ADMIN` may do so only for `SALES` and `VIEWER` targets.
- `SALES` and `VIEWER` may manage only their own link/request through self-service operations.
- Administrative force-disconnect also revokes outstanding requests for the target, but it does not modify Staff activation, role, Team Member activation, group membership, delivery recipients, or notification preferences.
- Unauthorized targets and authorized no-op states share the same externally neutral result.

## `/start` routing contract

The webhook classifies `/start`, `/start <payload>`, and addressed `/start@BotUsername` commands before generic inquiry replies. This precedence also applies when `reply_to_message` is present, so command text cannot enter a customer conversation.

Only a private chat update with distinct provider-supplied `message.from.id` and `message.chat.id`, an eligible human sender, a strict `ypt_...` payload, and a valid one-time request invokes consumption. Group, supergroup, channel, bot, malformed, expired, revoked, replayed, conflicted, and otherwise unavailable inputs never link and receive the same neutral invalid-link response. Plain `/start` receives a public-safe Staff Panel direction. Success, invalid-link, and plain-start messages are localized transiently from Telegram language metadata for `en`, `tr`, `fa`, and `ar`, with English fallback; language is neither persisted nor used for authorization.

Consumption commits before the confirmation transport is called. A failed confirmation cannot roll back the canonical link. Exact update IDs are not persisted by the Phase A schema; a redelivery retries the already-consumed token, returns the neutral invalid-link response, and cannot create a second link because request consumption and link uniqueness are transactional.

## Live actor and Team integration

Inbound Staff replies now resolve who sent the message exclusively through the canonical Telegram User ID link and current Staff authorization. `communication_recipients.external_id`, usernames, and group membership do not prove human identity. `telegram_inquiry_deliveries` still correlates the replied-to provider chat/message with its customer conversation, keeping identity resolution separate from delivery correlation.

Team Management's safe Linked/Not linked value now comes from an active `telegram_staff_links` row. Legacy recipient existence does not set the status. Authorized managers receive force-disconnect and pending-request-revocation controls through the existing current-role target policy: Super Admin may manage permitted other Staff; Admin may manage Sales and Viewer only; Sales and Viewer receive no manager controls. Connecting does not alter recipient destinations or notification preferences.

## Phase C Development rollout

Phase C completed against the approved Development environment after backup and provenance checks. Migration 0013 was applied once, with no identity backfill, recipient-destination rewrite, or notification-preference change.

The real Super Admin flow verified all of the following without exposing Telegram identifiers or credentials in the Staff UI:

- self-service private-chat connection and the safe `CONNECTED` projection;
- neutral plain `/start` and reply-to `/start` handling before inquiry-reply routing;
- one deliberate Telegram reply to one synthetic Development inquiry, including persistence, delivery correlation, current Staff actor resolution, customer-projection confidentiality, and replay idempotency;
- self-disconnect, immediate authorization denial while disconnected, and reconnect through a fresh request;
- reactivation of the same historical link row while preserving its original first-link timestamp, with no duplicate ownership and no usable request left behind; and
- continued compatibility of the legacy `TEAM_MEMBER` private destination, with `TEAM_GROUP` delivery configuration and notification preferences unchanged.

Final validation passed `pnpm lint`, `pnpm typecheck`, 1,613 unit tests across 136 files, `pnpm build`, `pnpm db:check`, 62 disposable PostgreSQL integration tests across 6 files, and Git whitespace checks. The disposable integration database was removed by the existing harness. The public Development tunnel later became unavailable because its TLS handshake failed; this did not invalidate the completed E2E evidence or block staging, but tunnel health must be rechecked before any further live Telegram testing.

No real Telegram identifiers, connection tokens, deep links, customer PII, session data, database credentials, or webhook secrets are recorded in this document or fixtures.
