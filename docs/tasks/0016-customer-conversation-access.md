# Customer Conversation Access

> Current browser transition: `docs/tasks/0028-customer-chat-resume.md` moves normal Customer traffic to tokenless, HttpOnly-cookie-authenticated routes. The token-in-path routes documented below remain a legacy compatibility surface.

## Decision

New customer chat traffic uses `GET` and `POST /api/conversations/{token}/messages`. The token is an opaque capability credential returned once by a successful Inquiry submission. The existing `/api/inquiries/{inquiryId}/messages` endpoints remain available as a legacy migration surface, but the customer UI no longer uses an Inquiry identifier for authorization.

Token resolution is an application use case and remains independent from HTTP. After resolution, the existing customer-message and history use cases retain ownership of message validation, ordered persistence, and public DTO mapping.

## Credential security

Each token contains 256 bits of cryptographic randomness. The raw token is never persisted. `conversation_access` stores a domain-separated SHA-256 lookup digest plus a separate SHA-256 verification digest, and verification uses a constant-time comparison. Unknown lookups are compared against a fixed dummy digest before returning the same `401 unauthorized` response used for malformed, mismatched, and expired credentials.

The application does not log request URLs, route parameters, tokens, credential lookups, or hashes. Responses use `Cache-Control: no-store` and never echo a token after Inquiry creation. Infrastructure request logging must keep the conversation token path redacted.

## Persistence and lifecycle

`conversation_access.conversation_id` is the primary key, enforcing one credential per Conversation. `token_lookup` is unique, `created_at` is required, and nullable `expires_at` supports future expiration policy without assigning an unrequested lifetime now.

Inquiry, Conversation, initial Message, access credential, and outbox event writes share the existing PostgreSQL transaction. Any credential persistence failure rolls back the complete Inquiry submission.

## Deferred work

Customer accounts, login, JWT, OAuth, credential rotation and recovery, realtime transport, WebSockets, SSE, and AI assistance remain outside this change.
