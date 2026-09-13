# Task 0011: Customer Inquiry Submission

- Status: Implemented
- Date: 2026-08-22

## Submission transport and ownership

`POST /api/inquiries` is the only public submission transport. It accepts JSON customer-owned fields, reads at most 32 KiB through a byte-counted stream, checks browser origins against the canonical site origin, rejects unexpected fields, and returns provider-independent error codes. The reader cancels as soon as an actual body exceeds the limit; `Content-Length` is only an early rejection optimization.

The endpoint has a constant-memory, single-process global fixed-window budget. Defaults are 60 requests per 600 seconds and may be changed with validated server-only `INQUIRY_RATE_LIMIT_MAX_REQUESTS` and `INQUIRY_RATE_LIMIT_WINDOW_SECONDS` values. Rejections return `429` with `Retry-After`. The limiter stores no client identifiers, resets on process restart, and is not shared across replicas. Multiple production application instances require a future shared limiter.

The existing payload parser owns structural validation, the Inquiry domain owns semantic normalization and invariants, and `SubmitInquiry` owns Product resolution, aggregate creation, and persistence orchestration. Product IDs, quantities, and canonical units are the only Product-line values accepted from browsers. The Product composition boundary resolves published localized records; trusted ID, SKU, slug, status, and localized name snapshots are created server-side.

## Persistence, privacy, and failures

The existing PostgreSQL repository transactionally inserts one Inquiry root and all ordered Product snapshot rows. Connections remain lazy: static generation and page rendering do not read database configuration or connect to PostgreSQL. Database or dependency failures return a generic `503` response without SQL, credentials, request bodies, or customer details.

The form validates locally, submits once while a request is in flight, preserves the draft after recoverable failures, clears stale feedback on edits, and reports localized pending, success, Product-unavailable, validation, and temporary-service states. Success means the Inquiry was stored; it does not mean Email, Telegram, or n8n delivery occurred. Duplicate clicks in one mounted form are blocked. Repeats after reload, across tabs, or from independent clients are not deduplicated.

The four Privacy pages disclose transmission to YolPol, PostgreSQL storage, request-management purpose, retention up to 24 months, and the absence of current security-metadata collection, analytics, Email, Telegram, and n8n delivery.

## Local operation and deferred work

Start development PostgreSQL with `docker compose up -d postgres`, configure the server-only `DATABASE_URL`, and run `pnpm db:migrate`. The isolated integration lifecycle remains `pnpm test:integration` and uses only `postgres-test`.

Run `pnpm retention:inquiries` with the production server's `DATABASE_URL` to delete Inquiry roots strictly older than the UTC 24-month cutoff; child Product rows are removed by the existing foreign-key cascade. Production deployment must schedule this command at least daily using the host scheduler and alert on nonzero exit. Cleanup is not automatic merely because the application is deployed; without this schedule, the published maximum retention period will not be met.

Local browser submissions accept exact same-origin `http://localhost:3000` and `http://127.0.0.1:3000` requests only when `NODE_ENV=development`. The check uses the HTTP `Host` header because Next.js may normalize the route request URL without its development port; it does not trust forwarding headers.

For iPhone/Safari development, set `YOLPOL_DEV_ORIGIN` in the untracked `.env.local` file to the exact URL used to access the Next.js development server, for example `http://192.168.1.100:3000`, then serve Next.js on the LAN interface and open that URL on the device. The optional value is parsed through the shared development-origin configuration and must be an absolute HTTP or HTTPS origin without credentials, any path other than `/`, a query, or a fragment. It is accepted only when `NODE_ENV=development`; other LAN hosts, ports, and schemes remain rejected. Exact Host-matched `localhost` and `127.0.0.1` development remain available without this variable. Production continues accepting only the canonical `siteConfig.url`, even if `YOLPOL_DEV_ORIGIN` is present.

Distributed multi-replica limiting, CAPTCHA, cross-tab or reload idempotency, durable notification Outbox jobs, notification delivery, n8n, monitoring, and deployment remain deferred.
