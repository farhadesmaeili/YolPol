# Telegram Real Integration

## Why persistence is required

One outbox-level retry state cannot safely represent a Telegram group plus multiple private recipients. It can resend successful recipients after a partial failure, cannot preserve the destination used for an earlier attempt, and cannot bind an inbound reply to the exact provider message. Migration `0009_robust_unus.sql` therefore adds `telegram_inquiry_deliveries` and a nullable operational Team Member mapping on `communication_recipients`.

Migration `0010_customer_conversation_message_created.sql` broadens only the `inquiry_outbox` event-type check so it accepts both `InquiryCreated` and `CustomerConversationMessageCreated`. During local development and manual E2E, migrations `0009` and `0010` were each reviewed and intentionally applied to the development database. This records development history; it is not an instruction to reapply either migration blindly in any environment.

No historical mapping or delivery is fabricated. Existing recipients retain `team_member_id = NULL` until an operator explicitly configures a trusted relation.

## Delivery ledger and lifecycle

The primary key `(outbox_event_id, recipient_id)` creates one row per snapshotted recipient for an `InquiryCreated` or `CustomerConversationMessageCreated` event. Each row stores the conversation, recipient kind, destination snapshot, attempts, due/lease timestamps, safe error code, and—only after confirmed delivery—the Telegram chat/message binding and delivery time.

The worker snapshots currently authorized, notification-enabled Telegram group and member recipients with conflict-safe insertion. Once at least one row exists, subsequent runs reuse that fixed set and the snapshotted `recipient_external_id`; recipient edits cannot redirect historical pending work. Authorization or notification-enable changes after snapshot apply to future events, not the already approved delivery set. An operator who must halt existing pending work must review and terminalize those ledger rows deliberately rather than silently redirecting them. Zero eligible recipients leaves the outbox event retryable so later explicit configuration can be discovered.

Lifecycle states are:

- `PENDING`: due for its first claim.
- `IN_FLIGHT`: held by a 60-second worker lease.
- `RETRYABLE_FAILURE`: a known retryable failure, due at `available_at`.
- `DELIVERED`: confirmed terminal success with provider IDs.
- `PERMANENT_FAILURE`: known terminal failure or retry exhaustion.
- `UNKNOWN`: terminal manual-review state for an ambiguous remote outcome.

The worker uses `FOR UPDATE SKIP LOCKED`. Known `429` responses honor `retry_after`; known Telegram/server `5xx` responses use bounded exponential backoff. Automatic delivery stops after five attempts with `RETRY_EXHAUSTED`. A `401` is provider-global credential failure, so affected deliveries remain `RETRYABLE_FAILURE` and the outbox remains incomplete while an operator corrects `TELEGRAM_BOT_TOKEN`. A `400` proves Telegram rejected the request but can represent recipient input, application, or configuration defects; without parsing fragile human descriptions it is also retried with the same bounded policy. A `403` is treated as recipient-level `PERMANENT_FAILURE` because it establishes that the bot cannot write to that private recipient or group. Raw descriptions/provider bodies are never persisted or logged.

Network interruption, timeout, malformed successful responses, and expired `IN_FLIGHT` leases become `UNKNOWN` and are not automatically resent. This is intentionally duplicate-averse: Telegram `sendMessage` has no application idempotency key, so exactly-once remote delivery cannot be claimed.

The original outbox event is processed only when every snapshotted row requires no automatic work. `DELIVERED`, `PERMANENT_FAILURE`, and `UNKNOWN` are terminal for automation; `PENDING`, `IN_FLIGHT`, and `RETRYABLE_FAILURE` are not. Consequently, a group and Staff A are not resent while only Staff B is retried.

## Schema lifecycle

Delivery rows restrict independent recipient deletion. They cascade only with their parent outbox event or conversation because those records are inquiry-owned and the existing inquiry retention operation intentionally deletes the inquiry aggregate. This preserves audit history during the aggregate lifetime without defeating the established privacy-retention boundary.

`communication_recipients.team_member_id` references the operational `inquiry_team_members` identity with restrictive deletion. `TEAM_GROUP` requires `NULL`; `TEAM_MEMBER` may remain unmapped. No uniqueness constraint prevents a Team Member from having multiple provider destinations.

## Provider, formatting, and composition

`TelegramCommunicationAdapter` uses standard `fetch` and the official Bot API `sendMessage` method with a ten-second timeout. It returns only safe application classifications and confirmed numeric chat/message IDs. Telegram documents user/chat IDs as having at most 52 significant bits, so the adapter and parser require JavaScript safe integers before Drizzle stores them in PostgreSQL `bigint`; boundary tests round-trip the documented maximum without precision loss. It never emits its token-bearing provider URL in an application error.

Notifications are plain text with no `parse_mode`. They include the inquiry reference, customer/company/location/destination, preferred contacts, requested quantities, customer message, source locale, and the trusted `siteConfig.url` link `/en/staff/inquiries/<inquiryId>`. Directional/control characters are neutralized and continuation lines are indented so customer content remains visibly subordinate. Text is capped at 3,900 UTF-16 units with code-point-safe truncation while preserving the reference, shortening notice, source locale, and Staff link. Internal pricing, access tokens, sessions, secrets, and database configuration are excluded.

`pnpm worker:inquiry-notifications` opens its own bounded PostgreSQL pool, loads only `DATABASE_URL` and `TELEGRAM_BOT_TOKEN`, composes the outbox/delivery/conversation repositories and provider, processes a bounded batch non-interactively, prints aggregate safe counters, closes the pool, and exits non-zero for pending retry, permanent failure, ambiguity, or process failure. It does not invoke Email. This process is ready to become a separate service later; no Compose production service or secret is baked in now.

## Local development polling runner

The tooling-only `pnpm dev:inquiry-notifications` command is a local-development convenience, not the final production deployment model. It explicitly refuses to start when `NODE_ENV=production`; the one-shot worker remains available for later production orchestration. It creates the same worker composition and PostgreSQL pool once, processes one iteration at a time, waits two seconds by default, and then checks for newly due outbox work again. Iterations never overlap: a slow iteration finishes before the delay and next iteration begin. A failed iteration emits only a generic operational event, waits, and retries without bypassing the existing delivery retry or `UNKNOWN` rules. Final production worker orchestration remains a separate deployment concern.

The runner reads `DATABASE_URL` and `TELEGRAM_BOT_TOKEN` from its process environment, just like the one-shot worker. It does not load `.env.local` itself. Load those variables through the local shell or approved secret-aware environment before starting it. The optional `INQUIRY_NOTIFICATION_DEV_POLL_MS` override accepts 500 through 60,000 milliseconds; its default is 2,000 milliseconds.

Run the Website and worker in separate terminals:

```text
Terminal 1
pnpm dev

Terminal 2
load DATABASE_URL and TELEGRAM_BOT_TOKEN into the process environment
pnpm dev:inquiry-notifications
```

`Ctrl+C` (`SIGINT`) and `SIGTERM` request graceful shutdown. The runner starts no further iteration, lets an active iteration finish, cancels an outstanding polling delay, removes its signal handlers, and closes the shared PostgreSQL pool exactly once. The existing `pnpm worker:inquiry-notifications` command remains available for a single processing cycle and still closes its own pool before exiting.

## Inbound flow and confidentiality

A Staff member replies to a YOLPOL bot message. The webhook authenticates first, authorizes the stable numeric sender against a `TEAM_MEMBER` communication recipient, resolves `(chat.id, reply_to_message.message_id)` through a confirmed delivery, and appends to the shared Conversation. Group replies correlate with the group `chat.id` while authorization still uses the individual `message.from.id`; the `TEAM_GROUP` row is never an actor. Private replies use the private chat binding and the same stable sender authorization. A trusted active Team Member mapping produces `staff:<teamMemberId>` internally. Unmapped recipients and mappings whose operational Team Member has since become inactive remain authorized only by their recipient row but receive `NULL` attribution for new messages; existing historical actor references are unchanged.

The existing customer incremental reader/SSE path emits the message normally. Its DTO contains message content, sender type, channel, and time only; it does not expose actor references, Team Member or recipient IDs, Telegram identities, or provider binding IDs. Inquiry status and assignment are unchanged.

## Environment and manual configuration

Configure values locally or through the deployment secret store; never paste secrets into chat, commit them, put them in command arguments, or bake them into an image:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_PUBLIC_ORIGIN=https://your-public-webhook-host.example
```

There is no `TELEGRAM_NOTIFICATION_CHAT_ID`. Destinations are explicit database records. Migration `0009` supplies the delivery/member-mapping schema used by the following setup, while migration `0010` permits the customer-conversation-message outbox event. Apply each migration at most once through the normal reviewed deployment process for the intended environment; never infer from local development history that another environment needs it. Then configure records manually in a transaction:

1. Verify the intended operational identity exists in `inquiry_team_members` and record its exact `id`.
2. Insert one `communication_recipients` row per group using `channel='TELEGRAM'`, `kind='TEAM_GROUP'`, the numeric Telegram chat ID as `external_id`, `team_member_id=NULL`, and the deliberate `authorized`/`notifications_enabled` flags.
3. Insert one row per Staff Telegram identity using `kind='TEAM_MEMBER'`, the stable numeric Telegram user/chat ID as `external_id`, and the verified operational ID as `team_member_id`. Use `NULL` if attribution has not been securely established.
4. Query the inserted rows inside the transaction, verify IDs/kinds/destinations/mappings and flags, then commit. Roll back on any mismatch. Do not infer mappings from names, usernames, email, role, assignment, or ordering.
5. Set `TELEGRAM_BOT_TOKEN` and an independently generated `TELEGRAM_WEBHOOK_SECRET` locally in the worker/web runtime secret environment. Restart only the affected processes.

For manual outbound E2E, run the worker against a deliberately created test inquiry/recipient in an approved non-production environment and confirm each delivery row. This is a real external send and is never part of automated validation.

For inbound E2E, Telegram requires a publicly reachable HTTPS endpoint; localhost and private LAN addresses do not work. The server/tooling-only `TELEGRAM_WEBHOOK_PUBLIC_ORIGIN` value is the environment-specific origin used to construct `<origin>/api/webhooks/telegram`. It is not browser configuration and must never use a `NEXT_PUBLIC_` prefix. The runtime webhook continues to authenticate Telegram solely with `TELEGRAM_WEBHOOK_SECRET`; the public origin grants no access.

### Local webhook management

Prefer a persistent VS Code Dev Tunnel so the public origin can be reused between development sessions. Store its HTTPS origin, without `/api/webhooks/telegram`, once in the uncommitted `.env.local` file:

```dotenv
TELEGRAM_WEBHOOK_PUBLIC_ORIGIN=https://your-persistent-dev-tunnel-origin.example
```

The repository-native commands use Node's built-in environment-file support to load `.env.local` for tooling only. They do not change normal Next.js environment behavior:

```text
pnpm telegram:webhook:set
pnpm telegram:webhook:info
```

`telegram:webhook:set` explicitly registers the constructed URL, the configured secret token, `allowed_updates=["message"]`, and `drop_pending_updates=false`. Pending updates are never silently discarded. `telegram:webhook:info` is read-only. MATCH/MISMATCH compares the currently registered URL with the expected configured URL, and the pending-update count reports Telegram's current provider backlog. When Telegram returns `last_error_date` or `last_error_message`, the command presents them as the last recorded delivery error and notes that retained historical information does not by itself establish a current failure. Telegram exposes no last-success field, so the tooling does not invent one.

If a new tunnel origin is created, change only `TELEGRAM_WEBHOOK_PUBLIC_ORIGIN` and rerun `pnpm telegram:webhook:set`, followed by `pnpm telegram:webhook:info`. The tunnel does not need to remain running after development stops; while it is offline, Telegram cannot deliver webhook requests. Never commit `.env.local` or paste Telegram secrets into documentation, command arguments, chat, or logs.

After registration, reply to a delivered bot message from an authorized numeric sender and verify the existing customer stream receives the reply without internal attribution/provider fields.

### Production webhook origin

Production can use `TELEGRAM_WEBHOOK_PUBLIC_ORIGIN=https://yolpol.com` or a separately approved public Telegram webhook host. Production deployment and orchestration remain outside this task; apply the same reviewed operations commands only from an authorized secret-aware environment.

## Validation boundary

Automated provider tests inject a mock `fetch`; they never contact `api.telegram.org`. PostgreSQL integration uses only the guarded disposable `postgres-test` service. Migrations are not applied to the development database by implementation or test commands; the reviewed manual development applications of `0009` and `0010` described above were separate operator actions.
