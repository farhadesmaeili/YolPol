# Telegram Reply Gateway

## Current decision

The inbound endpoint remains `POST /api/webhooks/telegram`. It accepts bounded JSON only when `X-Telegram-Bot-Api-Secret-Token` matches the server-only `TELEGRAM_WEBHOOK_SECRET`. Authentication happens before body parsing, configuration is read per request, and errors remain provider-neutral.

Telegram update parsing is infrastructure-only. A correlatable update must contain stable numeric `update_id`, `message.message_id`, `message.from.id`, `message.chat.id`, and `message.reply_to_message.message_id` values plus non-empty text. Display names, usernames, and copied reply text are not trusted.

After secret validation, syntactically valid Telegram Updates that are unsupported or not actionable are acknowledged with the same neutral HTTP 200 response as accepted and duplicate replies. Unauthorized senders and unknown delivery bindings are also acknowledged without persistence so Telegram does not retry irrelevant traffic and the response reveals neither authorization nor Conversation existence. Malformed transport requests retain 4xx responses, while dependency or persistence failures retain 5xx responses so Telegram can retry genuine service failures.

## Authorization, correlation, and persistence

The sender must match an authorized `TELEGRAM`/`TEAM_MEMBER` row in `communication_recipients`. `notifications_enabled` controls outbound notifications and does not revoke inbound authorization.

Correlation uses the authoritative provider binding `(message.chat.id, message.reply_to_message.message_id)` recorded on a `DELIVERED` row in `telegram_inquiry_deliveries`. Copied `Inquiry #...` text is no longer parsed or used as a fallback. The binding supplies the existing `conversation_id`.

An accepted reply is appended through the shared Conversation repository with `senderType = INTERNAL_USER` and `channel = TELEGRAM`. If the authorized recipient has a trusted mapping to an active Team Member, the internal message receives `actorReference = staff:<teamMemberId>`; unmapped or inactive mappings remain `NULL` for new messages. Existing historical attribution is unchanged. Identity is never inferred from Telegram profile data or `staff_accounts`.

Telegram's update ID remains the deterministic message ID `telegram_update_<update_id>`, so redelivery is idempotent. Customer history and streaming projections deliberately omit actor references and all Telegram/provider/recipient identifiers.

## Security boundaries

Webhook and bot secrets are separate environment-only values. Secret comparison uses fixed-length SHA-256 digests and timing-safe equality. The endpoint does not log request bodies, credentials, provider responses, or configuration values. See [0026](./0026-telegram-real-integration.md) for the outbound delivery ledger, worker, and operational setup.
