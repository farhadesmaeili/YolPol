# Staff Reply Composer UI

## Purpose and scope

The authenticated localized Staff Inquiry Detail route, `/{locale}/staff/inquiries/[inquiryId]`, now includes a production Staff Reply Composer in its existing Conversation panel. Staff can write a plain-text reply, submit it through the already-established `POST /api/staff/inquiries/[inquiryId]/messages` backend, and see the persisted Staff response once in the visible Conversation history without a full page reload.

The page remains a React Server Component. A focused `StaffReplyComposer` client boundary owns only the draft, submission status, retry key, and locally appended persisted messages needed for this interaction. It does not add a second Staff realtime system.

## Client/server trust boundary

The browser sends same-origin JSON containing exactly `body` and `clientMessageId`. It never sends a Staff Account ID, Team Member ID, role, sender type, channel, actor reference, session credential, customer access token, or provider credential. The existing API continues reading the `HttpOnly` Staff cookie, resolving and authorizing the Staff principal, deriving `staff:<team-member-id>` on the server, and persisting the message as `INTERNAL_USER` over `WEBSITE`.

Client validation improves feedback for blank and greater-than-10,000-character drafts, but the existing server validation remains authoritative. Replies remain plain text and React renders their content as text rather than HTML.

## `clientMessageId` lifecycle and retry behavior

A cryptographically secure UUID is created only when a new valid logical submission starts. The browser uses `crypto.randomUUID()` when that capability is available. Plain-HTTP LAN browsers may expose `crypto.getRandomValues()` without exposing `randomUUID()`; in that case, the client fills 16 random bytes, sets the RFC 4122 version 4 and variant bits, and serializes the canonical UUID form. If Web Crypto randomness is unexpectedly unavailable, submission fails with the existing safe localized service-unavailable state rather than using insecure entropy. The textarea is not cleared until a `200` or `201` response returns a valid persisted Staff message DTO.

An uncertain or failed submission keeps both its draft and its existing `clientMessageId`, so retrying unchanged text targets the same server-side idempotency identity. Editing a failed draft makes it a new logical message and clears the prior client key. A definitive `409` retry-key conflict also discards the unusable key while retaining the draft. After success, the draft and key are cleared; the next logical reply receives a fresh key.

Both new `201` responses and idempotent `200` responses use the same success path. The returned safe message is appended only if its stable message ID is absent, preventing a repeated response from creating a duplicate visible message.

## Submission, errors, and session expiry

The composer exposes idle, sending, success, and error states. Sending disables the textarea and submit button to prevent duplicate rapid submissions. Success announces a localized status, clears the draft, appends the persisted server response, and restores textarea focus. Failure keeps the typed text and shows a safe localized message for `400`, `401`, `403`, `404`, `409`, `413`, `415`, `429`, `503`, malformed success data, or network/dependency failure; raw backend errors are never rendered.

On `401`, the localized session-expired error is set and the existing locale-aware Staff navigation pattern replaces the route with `/staff/login` and refreshes the router. No cookie or credential is read or manipulated by client code.

## Staff actor display and confidentiality

The Server Component reuses `ListAssignableTeamMembers` and the already-resolved current Staff principal to construct a safe Team Member ID-to-display-name map. An `INTERNAL_USER` message with a matching `staff:<team-member-id>` actor reference displays that Team Member name. Null, malformed, inactive, historical, or otherwise unresolved internal actors display the localized `YOLPOL Team` fallback. Raw actor references are never used as visible author labels.

The actor mapping is Staff-only. Customer history and SSE DTOs remain unchanged and actor-free, so customers continue seeing only YOLPOL Team semantics. The Staff UI introduces no Product pricing, cost, margin, authentication secret, session material, customer access token, or provider secret.

## Deliberate non-effects and future integration

Sending a Staff website reply does not mutate Inquiry status, assignment, workflow history, or Inquiry timestamps. It does not invoke Telegram, email, WhatsApp, SMS, AI, or any other provider. The existing Conversation persistence remains the single source of truth, and the already-established customer SSE path can naturally deliver the stored reply.

The composer still receives immediate feedback from the authenticated API response. Staff persisted-message synchronization is now implemented separately by the existing authenticated Staff SSE endpoint and reconciles that local response by stable message ID; see `0027-staff-conversation-realtime.md`. No WebSocket, Redis, or provider-specific synchronization was added.

The existing Telegram reply gateway remains independent. A future outbound or bidirectional Telegram feature must reuse trusted operational identity and Conversation persistence without adding provider calls to this composer or exposing channel selection in the Staff UI.

No schema change or migration is required.

## Manual validation plan

### A. Desktop localhost

1. Start the development server and sign in through a localhost `/{locale}/staff/login` route.
2. Open an Inquiry, send a multiline reply, and confirm it appears exactly once with the resolved Team Member name or YOLPOL Team fallback.
3. Refresh Staff Inquiry Detail and confirm the persisted reply remains.

### B. iPhone over HTTP LAN

1. Set `.env.local` `YOLPOL_DEV_ORIGIN` to the exact LAN URL used by the device, restart the development server, and open `{YOLPOL_DEV_ORIGIN}/{locale}/staff/login` in iPhone Chrome or Safari.
2. Open an Inquiry and send a Staff reply; confirm the composer no longer throws when `crypto.randomUUID` is unavailable.
3. Keep the corresponding customer chat open and confirm the existing SSE displays the reply without refresh or raw actor attribution.
4. Verify narrow-screen wrapping, touch targets, horizontal overflow, and at least one RTL locale.

### C. Idempotent retry

1. Exercise an uncertain failed submission and retry the unchanged draft.
2. Confirm the same logical `clientMessageId` is reused and only one persisted message appears.
3. Confirm editing the failed draft creates a new logical message key.

Also exercise blank, oversized, server-failure, and expired-session states and confirm the draft is not silently lost.

These steps are a plan only; they must not be reported as passed unless performed against a live authenticated environment.
