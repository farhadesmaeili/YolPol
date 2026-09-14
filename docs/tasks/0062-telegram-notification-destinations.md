# Telegram Notification Destinations

## Scope

Authenticated Staff managers can explicitly authorize Telegram destinations for inquiry notifications without supplying Telegram identifiers in browser input. `SUPER_ADMIN` and `ADMIN` retain the existing account-management hierarchy; `SALES` and `VIEWER` have no destination-management capability.

## Security and lifecycle contract

- A TEAM_MEMBER destination is derived only from an active `telegram_staff_links` row. Connecting or reconnecting a Staff Telegram identity never enables notifications.
- Disabling a destination preserves authorization and history. Disconnecting a Staff Telegram link or group destination preserves the recipient but atomically sets `authorized=false` and `notifications_enabled=false`.
- A TEAM_GROUP destination is authorized with a ten-minute, single-use `ypg_` credential. The Staff Panel returns only a validated Telegram `startgroup` link. The webhook supplies the numeric group Chat ID and title.
- Group consumption requires a group or supergroup chat, a human sender, and an active Staff Telegram link belonging to the same current manager who created the request.
- Browser commands never contain Telegram User IDs, Chat IDs, usernames, authorization flags, roles, actors, bot credentials, or webhook secrets.
- Raw credentials are returned once inside the `startgroup` link and are never persisted. Persistence stores only domain-separated SHA-256 lookup and verification digests.
- Successful recipient state changes append immutable audit events. Staff-facing projections exclude raw Telegram identifiers, credential material, and internal commercial data.
- Migration normalization preserves every legacy recipient and delivery reference. If duplicate TEAM_MEMBER rows already exist for one channel/member, the most recent authorized row remains associated and older duplicates are disabled and detached from that member before the uniqueness constraint is added; no recipient or delivery row is deleted.

## Delivery contract

`ProcessInquiryNotifications` and its retry schedule remain unchanged. The delivery repository continues to snapshot only authorized and enabled Telegram recipients, with an additional active-link check for TEAM_MEMBER destinations. The existing `(outbox_event_id, recipient_id)` primary key remains the idempotency boundary.

Events with no delivery snapshots remain retryable and will discover newly eligible destinations on a later attempt. Existing snapshots remain immutable.

## HTTP and presentation

- `GET /api/staff/notification-destinations`
- `POST /api/staff/notification-destinations`
- `/{locale}/staff/notification-destinations`

POST uses a bounded discriminated command grammar for member enable/disable, group-request create/revoke, and group enable/disable/disconnect operations. Mutations require the current Staff session, strict Origin, and the dedicated fixed-window Staff mutation limiter.

The Staff page uses safe responsive cards and localized text for English, Turkish, Persian, and Arabic. Direction continues to come from the locale layout.

## Non-goals

- No AI, translation, provider-registry, product-pricing, outbox-reset, live deployment, or live Telegram operation changes.
- Internal disconnect does not remove the bot from a Telegram group; it only invalidates YOLPOL delivery authorization.
