# Authenticated Staff Conversation Replies

## Purpose and scope

This capability allows an authenticated and authorized Staff member to store a plain-text reply in the existing Conversation associated with an Inquiry. It adds the dynamic Node.js route `POST /api/staff/inquiries/[inquiryId]/messages`. The Inquiry-centric route matches the protected Team Operations API and prevents the browser from receiving or presenting a customer conversation access token.

This is a backend and application capability only. It adds no Staff reply UI, Inquiry status transition, assignment change, provider delivery, or AI response generation. Migration `0008_small_payback` adds first-class Conversation message actor attribution before reply UI and real provider integrations make unattributed internal history ambiguous.

## Architecture and trusted identity

The thin App Router module delegates to a server-only composition root. The HTTP adapter reads only the existing environment-specific `HttpOnly` Staff session cookie and resolves it through `ResolveStaffSession`. Missing, invalid, expired, revoked, or inactive identities receive `401`; authentication dependency failures receive `503`.

Authorization uses the explicit `StaffAuthorizationPolicy.mayReplyToCustomerConversation` capability. The initial policy permits valid `ADMIN` and `SALES` principals under the same active operational-identity rules as Team Operations. It grants no Product-pricing capability. An authenticated principal without the reply capability receives `403`.

The browser cannot provide a Staff Account ID, Team Member ID, role, sender type, channel, or actor reference. The strict request parser accepts exactly `body` and `clientMessageId`. After authorization, `actorReferenceFor` derives `staff:<team-member-id>` from the resolved `StaffPrincipal`. That trusted operational Team Member reference is persisted on the Message and also participates in the deterministic, opaque Staff message ID used for idempotency. No Staff Account, login email, role, session, or display-name snapshot is persisted.

`conversation_messages.actor_reference` is nullable `varchar(160)` with a non-empty length constraint. Migration `0008_small_payback` has no default or backfill, so historical and Customer messages remain `NULL`; attribution is never guessed from message IDs, assignments, timestamps, bodies, or current Team Member state. The generic Conversation actor reference value object rejects surrounding whitespace, control characters, empty values, and values longer than 160 characters without depending on Staff Authentication.

There is intentionally no foreign key from the generic actor reference to `inquiry_team_members`. The stored `staff:<team-member-id>` remains historical evidence when a Team Member is renamed or deactivated and cannot cascade-delete messages. A future Staff query/presentation feature may resolve the Team Member suffix to a current or retained display name; this backend does not add that UI or join.

## Request validation and CSRF protection

The mutation requires an exact valid Origin through the existing strict Origin policy used by Staff authentication mutations. Production permits the configured YOLPOL site origin. Development retains the existing explicitly approved and exact localhost/LAN behavior. The Staff cookie remains `HttpOnly`, `SameSite=Strict`, and `Secure` in production.

The endpoint requires `application/json`, rejects query parameters and unexpected JSON fields, and reads at most 32 KiB through the shared streaming bounded-body reader. Malformed JSON returns `400`, unsupported media returns `415`, and oversized bodies return `413`.

`SendStaffConversationReply` reuses `InquiryId`, `MessageId`, and the Conversation message-body normalization. Bodies are trimmed, must contain 1 through 10,000 characters, are never truncated, and remain plain text. The handler does not interpret or render HTML.

## Inquiry and Conversation resolution

The application use case validates the route Inquiry ID and loads the Inquiry through the existing `InquiryRepository`. A missing Inquiry and an existing Inquiry without a Conversation are distinguishable internally but both map to the same safe public `404 not_found` response. The browser never supplies a Conversation ID or customer access token.

The reply is created with the existing `Message` entity as `senderType: INTERNAL_USER` and `channel: WEBSITE`. `WEBSITE` is the existing web-channel enum value, so no database enum/check change is needed and the reply is not misrepresented as Customer or Telegram traffic.

## Idempotency and persistence

`clientMessageId` uses the existing URL-safe `MessageId` format. A server-only SHA-256 factory combines a domain separator, the trusted Staff actor reference, the validated Inquiry ID, and the client ID into an opaque `staff_web_<digest>` message ID. Therefore:

- the same Staff retry key targets the same stored message;
- different Staff identities using the same browser key remain distinct;
- the same browser key used for a different Inquiry remains distinct;
- different client keys remain distinct;
- Staff identity values are not exposed in the message ID;
- message body text is never the deduplication key.

`PostgresConversationMessageRepository.appendForInquiry` remains the only write adapter. Its existing transaction locks the Inquiry Conversation, calculates the next ordered `position`, and inserts the message with its actor reference. All ordered and incremental reads reconstitute the optional field. The existing primary key makes a retry a duplicate without adding another row. A duplicate is successful only when the existing message in that Inquiry has the same sender, channel, actor reference, and normalized body; key reuse for conflicting content or attribution returns `409 conflict`.

The migration does not alter globally unique message identity, per-Conversation position, ordering, cursor, or SSE event-ID semantics.

## Realtime and history compatibility

The existing history reader orders `conversation_messages` by `position`, and the SSE poller reads rows after the same position cursor, in ascending order, in batches of at most 100. Both customer boundaries deliberately use the existing actor-free `ConversationMessageDto`, so customers see `INTERNAL_USER` / YOLPOL Team semantics without receiving `staff:<team-member-id>`. Staff Inquiry detail and the authenticated Staff reply response use a separate `StaffConversationMessageDto` that includes nullable `actorReference` for future internal attribution UI.

The Telegram inbound foundation currently authorizes a `communication_recipients` record whose ID is not established as an `inquiry_team_members` operational identity. It therefore continues storing new Telegram replies with `NULL` attribution rather than fabricating a Staff actor. The generic nullable schema can support Telegram later after a trusted Team Member mapping is explicitly designed; no Telegram provider call or gateway redesign is included here.

## Workflow, assignment, and providers

Sending a reply uses only the Inquiry reader and Conversation message repository. It does not call the workflow repository, change Inquiry status, append `STATUS_CHANGED`, assign or unassign a Team Member, or update Inquiry timestamps. The existing `INQUIRY_CREATED` history remains untouched.

The Conversation Core remains the source of truth. This capability makes no Telegram Bot API, email, WhatsApp, SMS, AI, or other external-provider call. Provider delivery orchestration remains a separate feature.

## HTTP responses, confidentiality, and rate limiting

A newly inserted reply returns `201`; an idempotent retry returns `200`. Both expose only `{status: "sent", message}` to authenticated Staff, where the Staff message DTO contains `id`, `senderType`, `channel`, nullable `actorReference`, `body`, and `createdAt`. It exposes no authentication-account or session information. Every response uses `Cache-Control: no-store`.

Safe failure mappings are: invalid input `400`, unauthenticated `401`, forbidden or invalid Origin `403`, missing Inquiry/Conversation `404`, conflicting retry key `409`, oversized body `413`, unsupported media `415`, process-local rate limit `429`, and authentication/application/persistence dependency failure `503`. PostgreSQL errors, constraint names, stack traces, credentials, access digests, provider secrets, environment values, and internal Product pricing are never serialized.

The dedicated Staff reply limiter defaults to 120 authorized requests per 60 seconds. It is consumed only after authentication and authorization, is intentionally lenient for human conversation, and uses the repository's constant-memory single-process limiter. Multi-replica deployment still requires a separately designed shared or edge-level limiter; no Redis dependency is introduced here.
