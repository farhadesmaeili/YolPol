# Task 0006: Customer Inquiry Foundation

- Status: Implemented
- Date: 2026-08-15

## Scope

Establish a production-quality, framework-independent Customer Inquiry foundation without exposing a public submission workflow. The approved production origin is `https://yolpol.com`.

## Ownership and Feature Tree

`Inquiry` owns its opaque identity, contact and location data, optional destination/message, source locale/path, explicit privacy-consent evidence, immutable Product request snapshots, lifecycle, and timestamps. The feature permanently contains five responsibility-based layers: domain rules, application orchestration and ports, provider-independent infrastructure records/mapping/validation, presentation contracts, and deterministic testing utilities.

## Product Verification Boundary

Untrusted submission input contains Product IDs plus quantities and units only. `SubmitInquiry` resolves every ID through the Inquiry-owned `InquiryProductCatalog` application port, rejects missing, unpublished, or locale-unavailable Products, and replaces browser-supplied identity details with trusted ID, SKU, global slug, and localized-name snapshots. A future composition adapter will implement this port through the Product application boundary; Inquiry does not import Product domain or infrastructure.

The external payload parser accepts only plain records, rejects unexpected keys, structurally validates every nested section and item, and reconstructs a fresh primitive `SubmitInquiryInput`. It never trusts or spreads the original object. The domain retains semantic trimming, length, consent, and aggregate validation. The application Clock supplies the single authoritative timestamp for Inquiry creation, update, and consent evidence.

Catalog output is runtime-checked and its ID must exactly equal the requested Product ID. Thrown, malformed, mismatched, Clock, and ID-generator failures return `dependency_failed` with the closed dependency values `catalog`, `clock`, or `id_generator`; no adapter detail crosses the application boundary. Presentation maps validation paths to closed UI fields with a form-level fallback.

Non-throwing dependency output also fails closed: Clock output must be a finite real `Date` and is copied immediately, generated IDs are validated through the domain-owned `InquiryId` factory, and catalog-owned ID/SKU/slug/localized-name facts are validated through the domain-owned Inquiry Product snapshot factory. Customer-owned quantity and unit errors remain validation failures. Notification dispatch counts only the exact plain `requested` result as success; malformed or explicit failed results are recorded against the channel that was attempted.

Source paths begin with exactly one slash followed by the matching supported locale and optional safe segments. Dot segments, duplicate separators, schemes, encodings, controls, queries, and hashes are rejected; an optional trailing slash is preserved. Single-line fields reject C0, DEL, C1, and Unicode line/paragraph separators. Customer messages normalize CRLF/CR to LF, allow multiline Unicode and safe whitespace, and reject other controls.

## Reliability Semantics

The aggregate is persisted before notification dispatch. Email and Telegram are both attempted independently after persistence; failed channels produce `accepted_with_notification_failures`, while the accepted Inquiry remains persisted. Persistence failure prevents every notification attempt. This is not an exactly-once or transactional-Outbox guarantee.

No fake production adapter was added to imply durability. Task 0010 subsequently implemented the existing repository port with self-hosted PostgreSQL, Drizzle, node-postgres, committed migrations, and real integration tests; the validating provider-independent record mapper remains the boundary between rows and domain reconstitution.

Testing fakes snapshot primitive aggregate state and reconstitute fresh instances so mutations cannot alter simulated persistence. Notification dispatch results contain only `requested` or `failed`; the use case associates failures with the channel it requested, preventing contradictory channel results.

## Deferred Integration

Activation still requires a public abuse-prevention design, durable Outbox or equivalent retry jobs, email and Telegram adapters, operational monitoring, and secrets configured on the private self-hosted deployment. PostgreSQL persistence and the published Privacy Policy now exist as inactive foundations. Future integration variables may include `RESEND_API_KEY`, `INQUIRY_EMAIL_FROM`, `INQUIRY_EMAIL_TO`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`; database access uses server-only `DATABASE_URL`.

File uploads, object storage, n8n automation, idempotency, rate limiting, CAPTCHA, administration, CRM, quotes, prices, shipping calculations, and deployment remain deferred. Task 0006 itself introduced no Privacy Policy text or route, Inquiry route, form, navigation entry, sitemap entry, Server Action, route handler, provider SDK, environment reader, or external call; Task 0010 later added the server-only PostgreSQL environment reader.

## Integration Activation Checklist

- [x] Publish the reviewed Privacy Policy foundation and stable version.
- [x] Implement the self-hosted PostgreSQL schema and repository adapter.
- Persist Inquiry plus durable notification jobs atomically.
- Add retry/idempotency and operational failure visibility.
- Implement Resend and Telegram adapters behind application ports.
- Configure production secrets on the private server without committing them.
- Add validated abuse controls and a real public submission boundary.
- Add integration and end-to-end tests before exposing a route or form.
