# Telegram Reply Gateway Phase 1

## Decision

The inbound endpoint is `POST /api/webhooks/telegram`. It accepts only JSON requests whose `X-Telegram-Bot-Api-Secret-Token` header matches the server-side `TELEGRAM_WEBHOOK_SECRET`. Configuration is read when a request arrives so builds do not require live Telegram credentials.

Telegram update parsing remains in infrastructure. A valid Phase 1 update is a text message sent as a reply to a text or caption containing exactly one standalone `Inquiry #<id>` line. The parser also accepts the existing provider-neutral `Inquiry: <id>` notification line for compatibility. It extracts the update, message, chat, and sender identifiers; the reply body; the replied message body; and the inquiry identifier.

The application authorizes the Telegram sender against `communication_recipients`. The row must match the `TELEGRAM` channel, `TEAM_MEMBER` kind, sender external ID, and `authorized = true`. Notification enablement does not control reply authorization.

## Conversation persistence and idempotency

An accepted reply becomes an existing conversation message with `INTERNAL_USER` sender type, `TELEGRAM` channel, and the trimmed reply text. Conversation lookup uses the parsed inquiry ID.

No migration is required. Telegram's update ID becomes the deterministic message ID `telegram_update_<update_id>`, protected by the existing `conversation_messages` primary key. The PostgreSQL repository locks the matched conversation row while assigning the next position, and a primary-key conflict is treated as an already accepted delivery. No customer delivery is triggered.

## Security boundaries

Webhook and bot secrets remain environment-only. Secret comparison uses fixed-length SHA-256 digests and a timing-safe equality check. The endpoint authenticates before reading the payload, bounds the request body, returns provider-neutral errors, disables response caching, and does not log request bodies, credentials, or configuration values.
