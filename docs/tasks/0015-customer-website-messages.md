# Customer Website Messages Phase 1

## Decision

The public endpoint is `POST /api/inquiries/{inquiryId}/messages`. It accepts exactly one JSON-owned field, `message`, and uses the existing opaque Inquiry identifier to locate its one-to-one Conversation. This phase does not create conversations: a missing related Conversation returns a safe not-found response.

The application use case validates the Inquiry identifier and message body, creates a Conversation Core `Message` with `CUSTOMER` sender type and `WEBSITE` channel, and delegates the atomic Conversation lookup and append to the existing Conversation message repository. Successful responses contain only the created message identifier.

## Security boundaries

The endpoint applies the existing public Inquiry origin policy, accepts only `application/json`, rejects unexpected payload fields, reads at most 32 KiB, and enforces the Conversation Core limit of 1 to 10,000 non-whitespace characters. It has a separate in-process fixed-window limiter using the existing Inquiry rate-limit configuration so chat traffic cannot consume the Inquiry-submission budget.

Responses disable caching and expose only stable error codes. Request bodies, customer content, database details, and environment values are never logged. The Inquiry identifier is an opaque reference, not a customer authentication system; stronger authenticated customer identity remains outside this phase.

## Persistence and deferred work

No schema or migration change is required. Messages use the existing `conversation_messages` table. The PostgreSQL repository locks the related Conversation while assigning the next position, preserving ordered concurrent appends.

Chat UI, message reads, realtime delivery, WebSockets, AI, translation, Email, WhatsApp, and additional communication providers remain deferred.
