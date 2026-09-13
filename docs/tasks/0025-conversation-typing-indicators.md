# Bidirectional Conversation typing indicators

## Scope

This feature adds provider-neutral, ephemeral typing presence between the website Customer chat and the authenticated Staff Inquiry conversation. It does not change Conversation messages, Inquiry workflow, assignments, status, outbox delivery, or provider integrations.

## Architecture

`ConversationTypingRegistry` is an application port. `InMemoryConversationTypingRegistry` is the current process-local implementation and is composed as one singleton for the Node.js process. It stores only:

- Conversation scope;
- participant (`CUSTOMER` or `STAFF`);
- an internal actor key needed to aggregate multiple Staff members; and
- expiry timer metadata.

It never stores a draft, message body, contact information, customer access token, Staff session credential, Staff email, role, or persisted event. Customer presence uses one fixed internal actor key. Staff identity is derived from the authenticated `StaffPrincipal`; the browser cannot submit it.

This implementation is correct for the current single-instance deployment. Process-local presence and rate limits do not coordinate across replicas. A future multi-replica deployment requires shared ephemeral presence and pub/sub, such as Redis, while retaining the application port and safe aggregate wire events.

## Timing

- Client heartbeat interval: 2,000 ms.
- Client inactivity threshold: 3,000 ms.
- Server typing TTL: 5,000 ms.
- SSE keepalive: 15,000 ms.

The first meaningful non-empty edit sends `isTyping: true`. Continued input reuses the controlled heartbeat; it does not create a request per keystroke. Empty drafts, inactivity, successful Send, and component cleanup send a best-effort `false`. A missing `false` cannot leave permanent state because each heartbeat replaces the server TTL.

Typing requests use dedicated process-local fixed-window limiters. Their default is 120 requests per 60 seconds independently for Customer and Staff traffic, which accommodates a two-second heartbeat. Operators may configure `CONVERSATION_TYPING_RATE_LIMIT_MAX_REQUESTS` and `CONVERSATION_TYPING_RATE_LIMIT_WINDOW_SECONDS`.

## Customer to Staff flow

1. `POST /api/conversations/[token]/typing` accepts exactly `{"isTyping": boolean}`.
2. Strict Origin, media type, body size, rate limit, and exact-payload checks run at the HTTP boundary.
3. The existing hash-only Conversation access-token resolver derives the authorized Conversation. Unknown, mismatched, and expired tokens remain the same safe `401` outcome.
4. The process-local registry updates aggregate `CUSTOMER` state.
5. `GET /api/staff/inquiries/[inquiryId]/stream` authenticates the existing HttpOnly Staff session, checks `mayReplyToCustomerConversation`, resolves the Inquiry Conversation, and subscribes only to that Conversation's Customer presence.

Deployment request logging must continue to redact all `/api/conversations/{token}/*` paths, including the typing endpoint.

The Staff wire event is:

```text
event: typing
data: {"participant":"CUSTOMER","isTyping":true}
```

## Staff to Customer flow

1. `POST /api/staff/inquiries/[inquiryId]/typing` accepts exactly `{"isTyping": boolean}`.
2. The endpoint authenticates the HttpOnly Staff session and reuses `mayReplyToCustomerConversation`.
3. The server derives the Staff actor key and resolves the Inquiry Conversation; no identity comes from the browser.
4. Multiple active Staff actor entries aggregate to one `STAFF` state. Customer presence stays active until the last Staff entry stops or expires.
5. The existing `GET /api/conversations/[token]/stream` carries the aggregate Staff event over the already-open Customer EventSource.

The Customer wire event is intentionally limited to:

```text
event: typing
data: {"participant":"STAFF","isTyping":true}
```

No actor reference, Team Member ID, Staff Account ID, session ID, email, or role is serialized.

## Persisted SSE cursor independence

Persisted `message` events continue to use `conversation_messages.position` in their SSE `id:` field. Typing frames have no `id:` field, do not allocate positions, and do not alter `Last-Event-ID`. Reconnect replay and message deduplication therefore remain based only on persisted Conversation messages. Typing state is never replayed as history; a new subscriber receives the current in-memory aggregate snapshot, including `false`, so reconnecting clients can clear stale presentation state.

Both streams return `text/event-stream`, disable caching and proxy buffering, send keepalive comments, isolate Conversation subscriptions, and close registry registrations on cancellation.

## Presentation and accessibility

Customer and Staff composers share the same heartbeat controller. Presence failures are swallowed at this non-critical boundary and never disable Send, clear a draft, or change message retry/idempotency behavior. Successful message delivery stops typing immediately without waiting for the stop request.

The indicator has translated English, Turkish, Persian, and Arabic labels. It uses logical alignment, retains the existing mixed-message `dir="auto"` behavior, reserves a small status row to limit layout movement at narrow widths, and uses a polite atomic status only on aggregate state transitions. The three-dot animation is CSS-only and disabled by `prefers-reduced-motion`.

## Persistence and integration exclusions

There is no migration and no typing database record. Typing does not create or mutate:

- `conversation_messages`;
- `inquiry_workflow_events`;
- `inquiry_outbox`;
- `inquiry_assignments`;
- Inquiry status; or
- Conversation history.

No Telegram, email, WhatsApp, SMS, AI, queue, WebSocket, Redis, or other provider call was added.

## Manual live E2E plan

1. Open a Customer chat and its matching authenticated Staff Inquiry.
2. Type without sending in the Staff composer; verify the Customer sees the localized “YOLPOL Team is typing…” status.
3. Stop, then start again and Send; verify the status clears and the persisted message arrives through the existing Customer SSE stream.
4. Type without sending in the Customer composer; verify Staff sees the localized “Customer is typing…” status.
5. Stop, then send; verify the status clears without changing reply/message behavior.
6. Interrupt a heartbeat where practical and verify the server TTL clears the remote indicator while Send remains usable.
7. Repeat at approximately 390 px in one LTR locale (`en` or `tr`) and one RTL locale (`fa` or `ar`). Verify no overflow, control overlay, major layout jump, or direction regression.
8. Repeat on the configured iPhone development origin before claiming real-device success.
