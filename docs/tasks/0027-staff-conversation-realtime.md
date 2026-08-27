# Staff Conversation Realtime

## Scope

The authenticated Staff Inquiry Detail page now receives newly persisted Conversation messages without a refresh. The existing `GET /api/staff/inquiries/[inquiryId]/stream` endpoint remains the single Staff realtime channel and multiplexes persisted `message` events, transient Customer `typing` events, and keepalive comments.

Before this feature, Staff Inquiry Conversation history was loaded once and the Staff stream carried only transient Customer typing. Newly persisted Customer Website and Telegram-originated Conversation messages therefore required a page refresh. After this feature, the existing Inquiry-scoped Staff stream carries persisted Conversation messages alongside transient typing. PostgreSQL remains authoritative for persisted messages, `conversation_messages.position` provides their resumable cursor, and ID-less typing and heartbeat frames cannot advance that cursor.

This feature does not change message persistence, Inquiry workflow, assignment, Telegram delivery, provider configuration, or customer-facing Conversation DTOs. It adds no WebSocket, Redis, external pub/sub, schema migration, or provider call.

## Persisted message delivery

PostgreSQL remains the source of truth. Staff streaming reuses the existing bounded Conversation polling application service and the existing 1,500 ms polling interval. Each poll performs a short ordered query for at most 100 messages after the current cursor; it does not hold a PostgreSQL connection for the lifetime of the browser stream, overlap polling loops, or retain message history in memory.

The Staff projection is provider-neutral and can carry persisted messages from `CUSTOMER`, `INTERNAL_USER`, `AI_AGENT`, or `SYSTEM` senders and `WEBSITE`, `TELEGRAM`, `EMAIL`, or `WHATSAPP` channels. It uses the existing authorized `StaffConversationMessageDto`, including nullable actor attribution, without adding provider credentials, customer access material, database configuration, Product pricing, or other internal records.

A persisted frame is:

```text
id: 12
event: message
data: {"id":"message-id","senderType":"CUSTOMER","channel":"WEBSITE","actorReference":null,"body":"Hello","createdAt":"2026-08-28T10:00:00.000Z"}
```

The `id` is the message's monotonically increasing `conversation_messages.position`. The database query is ordered by that position and reads only positions greater than the active cursor.

## Initial history and reconnect cursor

The Server Component still renders the complete initial Staff Conversation history. The same ordered persistence read also exposes only its highest rendered position as `conversationCursor`; an empty history uses `-1`. The client opens the Staff EventSource with `?cursor=<conversationCursor>`, so a message committed after the history query but before the SSE connection is returned by the stream instead of being lost.

After the stream receives a persisted event, the browser records its SSE `id`. On automatic reconnect, `Last-Event-ID` takes precedence over the initial query cursor. The server resumes with messages whose position is greater than that ID. Stable position ordering plus client reconciliation by position and message ID prevents replay duplicates while retaining missed-message recovery.

The existing Staff Website reply stays locally appended after a successful POST. When the same persisted record arrives through SSE, its stable message ID advances the realtime cursor but is not rendered a second time. The same rule applies whether the POST response or SSE echo arrives first.

## Typing and heartbeat independence

Customer typing remains process-local, ephemeral, and non-persisted:

```text
event: typing
data: {"participant":"CUSTOMER","isTyping":true}
```

Typing frames have no `id`, never allocate or advance a Conversation message position, and do not affect `Last-Event-ID`. The existing two-second client heartbeat, inactivity handling, five-second server TTL, and Staff-to-Customer typing path are unchanged.

Keepalive comments remain lightweight and ID-less:

```text
: keep-alive
```

They do not alter the persisted cursor.

## Security and lifecycle

The Staff stream keeps strict Origin validation, the HttpOnly Staff session resolver, `StaffPrincipal`, and `mayReplyToCustomerConversation` authorization before resolving the Inquiry Conversation or allocating stream resources. Missing sessions remain `401`, denied Staff access remains `403`, absent Conversations remain `404`, and dependency failures remain neutral.

Staff access remains capability-based and is not yet restricted by an assignment-specific per-Inquiry ACL. Assignment-specific authorization is a future feature and is not introduced by this realtime change.

Cancellation or request abort clears the keepalive interval, closes the Customer typing subscription, aborts the persisted polling session, removes abort listeners, and releases the bounded in-memory stream registration. EventSource retains its normal three-second reconnect instruction. The current in-memory capacity registries remain process-local; a future multi-replica deployment would require shared ephemeral coordination, which is outside this feature.

## Manual E2E status

The user manually verified the following in the live authenticated environments:

1. A Customer Website message persisted as a Conversation Message and appeared in Staff Inquiry Detail in realtime without a refresh.
2. Customer typing displayed the Customer typing indicator to Staff.
3. Staff typing displayed `YOLPOL Team is typing…` to the Customer.
4. A Staff Website reply appeared immediately in the Staff UI, its SSE echo did not render a duplicate, and the Customer received it through the existing Customer SSE.
5. A Telegram-originated Staff reply persisted in the same Conversation, appeared in the Staff Panel without a refresh, and reached the Customer through the existing Customer SSE.
6. After a Staff reconnect, missed persisted messages were recovered without duplicate rendering.

No additional manual E2E scenarios are recorded as passed by this task.
