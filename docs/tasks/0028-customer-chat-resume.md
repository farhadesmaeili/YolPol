# Customer Chat Resume

## Problem and scope

Customer Chat previously depended on the raw `ypc_` Conversation capability returned by a successful Inquiry submission and retained only in React state. Refreshing the localized Inquiry page recreated empty form state, so the token and Chat disappeared even though the Conversation remained stored.

This feature supports exactly one resumable Customer Conversation per browser cookie jar. It does not add Customer accounts, login, magic links, multi-device recovery, a portal, or multi-Conversation navigation. A later successful Inquiry overwrites the same cookie; the older Conversation remains stored but is no longer resumable from that browser through this mechanism.

## Capability and cookie architecture

The existing 256-bit capability remains the authentication secret. PostgreSQL continues to store only the domain-separated SHA-256 lookup and verification digests in `conversation_access`; the raw capability is never stored in PostgreSQL. New credentials receive a 30-day `expires_at` value at the same time the Inquiry, Conversation, optional initial Message, access record, workflow event, and Outbox event are persisted transactionally.

After persistence succeeds, the Inquiry HTTP boundary writes the raw capability only to an HttpOnly response cookie. Successful browser JSON is limited to `{"status":"created","inquiryId":"..."}`; the raw capability no longer reaches application JavaScript. The cookie is:

- `__Host-yolpol_customer_conversation` in production and `yolpol_customer_conversation` in development;
- `Path=/`, so it survives all four locale paths and locale navigation;
- `HttpOnly` and `SameSite=Strict`;
- `Secure` in production, with the non-Secure development name available over an explicitly approved HTTP development Origin;
- finite `Max-Age=2592000` and an exact `Expires` value aligned with the stored 30-day credential expiry; and
- host-only, with no `Domain` attribute.

The value is not placed in a query string, route path, rendered HTML, `localStorage`, `sessionStorage`, or IndexedDB. Application request handlers do not log the capability. Deployment logging must continue to redact legacy `/api/conversations/{token}/*` paths while that compatibility surface exists.

## Customer HTTP authentication

The normal browser flow now uses locale-neutral, tokenless routes:

- `GET /api/customer/conversation` restores safe ordered history;
- `POST /api/customer/conversation/messages` appends a Customer website Message;
- `GET /api/customer/conversation/stream` opens the existing SSE stream; and
- `POST /api/customer/conversation/typing` updates transient Customer presence.

Each boundary reads exactly one environment-appropriate resume cookie, resolves it through the existing application use case, and reuses the existing history, receive-message, SSE, and typing behavior. Missing, duplicate, malformed, unknown, mismatched, and expired credentials all return the same safe `401 unauthorized` outcome without exposing a Conversation oracle. The Inquiry form remains available when restoration does not authenticate.

The previous `/api/conversations/[token]/messages`, `/stream`, and `/typing` routes remain as a backwards-compatible legacy surface, but browser presentation code no longer calls them. The older Inquiry-ID message endpoints are also unchanged by this task.

## CSRF, SSE, typing, and confidentiality

Cookie-authenticated message and typing mutations require an explicit Origin accepted by the repository's exact same-Origin policy. `SameSite=Strict` is defense in depth, not the only CSRF control. History and SSE are read-only and retain the existing safe GET Origin behavior.

SSE still resolves access before opening, uses `conversation_messages.position` for persisted message IDs and `Last-Event-ID` replay, and emits process-local Staff typing frames without an SSE ID. Typing remains minimal, best-effort, and process-local. Customer DTOs and SSE frames continue to omit Staff actor references, Team/Account identifiers, provider identifiers, credentials, and internal Product prices.

## Refresh and locale behavior

On every localized Inquiry page mount, the client requests `GET /api/customer/conversation`. A valid cookie returns safe history, which initializes Customer Chat immediately; its EventSource then reconnects to the same Conversation. An absent or rejected cookie leaves the normal Inquiry form with no Conversation exposed. Because the cookie uses `Path=/` and APIs are locale-neutral, access survives navigation among `en`, `tr`, `fa`, and `ar`; existing LTR and RTL presentation remains unchanged.

## Migration and lifecycle status

No migration is required. Migration `0005_customer_conversation_access.sql` already provided nullable `conversation_access.expires_at`, and the resolver already handled expiry without distinguishing it from other unauthorized access. Newly issued credentials now populate that field. Previously issued credentials with `NULL expires_at` remain compatible through legacy token routes and are not silently rewritten.

There is no Customer end-chat/revoke operation in this scope. Removing the browser cookie forgets local resume access, but it does not revoke the server-side capability. A future revoke feature needs an explicit server-side revocation model and migration review.

## Manual E2E verification

Manual verification completed successfully on desktop and iPhone/Safari over the exact configured development Origin:

1. A Customer submitted a new Inquiry and Customer Chat opened successfully.
2. The development HttpOnly resume cookie was set.
3. The Customer sent a Message successfully.
4. A browser refresh restored the same Conversation and its existing history without browser JavaScript retaining the raw capability or using `localStorage` or `sessionStorage`.
5. The Customer continued sending Messages after refresh, and Staff received subsequent Customer Messages in realtime.
6. A Staff Website reply reached the Customer through the existing Customer SSE connection.
7. A second refresh still restored the same Conversation.
8. Locale navigation preserved access, and LTR/RTL behavior remained correct.
9. Removing the resume cookie prevented Conversation restoration and returned the browser to the normal Inquiry UI.
10. Creating a new Inquiry replaced the browser's single active resumable Conversation cookie, making the new Conversation the resumable one while PostgreSQL remained authoritative for both stored Conversations.
11. Successful Inquiry JSON did not expose the raw `ypc_...` capability.

The normal browser flow stores the raw capability only in the HttpOnly cookie, not in browser JavaScript state, `localStorage`, `sessionStorage`, IndexedDB, or token-bearing URLs. The legacy token-in-path routes remain compatibility debt and are not part of this verified browser flow. Historical credentials with `NULL expires_at` retain their documented legacy compatibility, and no migration was required. Production reverse-proxy cookie behavior was not part of this development-device verification.

## Future evolution

Anonymous multi-Conversation resume should replace the single capability cookie with a server-side anonymous session identifier whose records reference multiple independently revocable Conversation grants. Customer Accounts can later bind those grants to authenticated Customer identity, add multi-device recovery, and expose an Inquiry history UI without changing Conversation message or provider boundaries.
