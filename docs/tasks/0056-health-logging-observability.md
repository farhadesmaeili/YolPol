# Health, Logging & Observability Foundation

## Goal and scope

This feature adds the application-level operational signals required before Staging: web liveness, application/database readiness, safe build identity, JSON-lines logging, bounded request correlation, baseline response security headers, and consistent worker lifecycle events. It does not add a monitoring/alerting stack, deployment infrastructure, a business dashboard, provider probes, or a database migration.

## Previous state

The application had no health routes. API and page requests had no correlation identifier. Staging page responses received `X-Robots-Tag` through the locale proxy, but API routes were excluded from that proxy and no global baseline security headers were configured. HTTP handlers did not emit operational request logs.

The three long-running worker families emitted content-free lifecycle/error strings through injected `console` methods, with some JSON-shaped records, but there was no centralized timestamp, level, service, filtering, error normalization, or redaction contract. Worker process/container state and those events were the only liveness signals; no heartbeat was persisted.

## Health architecture

Health is an isolated five-layer feature:

- Domain owns the safe build identity and readiness result types.
- Application owns the application/database probe and diagnostic logger ports plus the readiness use case.
- Infrastructure validates runtime configuration, probes PostgreSQL/Drizzle state, and throttles failure diagnostics.
- Presentation maps liveness/readiness results to minimal HTTP responses.
- Testing supplies fake probes and a fake diagnostic logger.

Thin App Router routes expose `GET /api/health/live` and `GET /api/health/ready`. Both use the Node.js runtime, force dynamic execution, and return `Cache-Control: no-store`.

## Liveness semantics

Liveness answers only whether the web process can serve HTTP. It returns HTTP `200` with:

```json
{"status":"ok"}
```

The handler has no database, configuration, queue, Telegram, AI, DNS, or other provider dependency and emits no success log.

## Readiness semantics and database strategy

Readiness first validates the existing deployment environment contract, the optional log level, and the optional Git revision. It then uses the existing lazily composed PostgreSQL pool.

One bounded query reads only the newest row from `drizzle.__drizzle_migrations` by primary-key order. A successful result must have a migration timestamp at least equal to `0022_global_translation_settings`, the minimum schema version required by the currently running application. This marker MUST be intentionally updated when a future application release requires newer migrations. Drizzle's runtime migration table stores the migration timestamp and hash rather than the human-readable tag, so the readiness probe intentionally uses the journal timestamp compiled into the application. The query simultaneously proves connectivity and that the migration journal is usable; it has a 3-second query timeout and remains subject to the pool's existing 5-second connection timeout. It does not run migrations, acquire schema locks, inspect application rows, scan queues, or contact external providers. A unit test binds the compiled expectation to the latest repository journal entry so required schema changes cannot advance without an intentional readiness-marker update.

Successful readiness returns HTTP `200`:

```json
{
  "status": "ok",
  "checks": {"application": "ok", "database": "ok"},
  "version": "0.1.0"
}
```

When configured, a validated hexadecimal `revision` is also present. Database failure returns HTTP `503` with only `database: "failed"`; application configuration failure returns HTTP `503` with `application: "failed"` and `database: "not_checked"`. Raw errors, SQL, connection details, configuration dumps, secret presence, providers, identities, and queue counts are never returned.

Readiness failures emit one redacted warning per failed check per process per 60-second interval. Successful liveness/readiness probes are silent.

## Version and revision identity

The application version comes from the existing `package.json` metadata and is not bumped by this feature. `YOLPOL_GIT_REVISION` is optional, server-only, non-secret configuration accepting only a 7-64 character hexadecimal Git revision. It is not required in Development or CI. Branch names and release-promotion behavior are not exposed or introduced.

## Structured logging and redaction

The repository-owned logger writes one JSON object per line through stdout/stderr-compatible console methods. Every record contains `timestamp`, `level`, `event`, `service`, and `requestId` (null outside correlated HTTP work). Supported levels are `debug`, `info`, `warn`, and `error`; `YOLPOL_LOG_LEVEL` is optional and defaults to `info`.

Central recursive redaction covers token, secret, password, API-key, authorization, cookie/set-cookie, direct credential, database URL/connection string, request/content/body/message/prompt, Customer email/phone, and pricing/cost/margin field names. Opaque `credentialReferenceId` metadata remains usable. Error objects are reduced to their class/name and an allowlisted uppercase error code; arbitrary messages, provider objects, headers, URLs, payloads, and stacks are not serialized. New health/worker logging contains only operational identifiers, state, timing, attempts, signals, and aggregate counters—never Inquiry free text, Customer/Staff messages, prompts, provider payloads, contact details, or internal pricing.

## Request correlation

`X-Request-ID` is the canonical header. An inbound value is reused only when it is 1-64 ASCII characters, begins alphanumerically, and otherwise contains only alphanumerics, `.`, `_`, `:`, or `-`. Missing or invalid values are replaced with a Web Crypto UUID.

The proxy now includes API routes while continuing to exclude Next/Vercel internals and file assets. For API requests it forwards the normalized ID as an internal request header; all matched responses receive the same ID. Locale middleware remains limited to non-API paths, preserving locale routing and static generation. Readiness diagnostics consume the validated propagated ID. This feature intentionally does not add high-volume logging for every page, static asset, or successful API request, and does not introduce `AsyncLocalStorage`.

## Worker logging

Continuous and one-shot worker entrypoints now use the shared structured logger. Events include `worker.started`, `worker.stopping`, `worker.stopped`, `worker.iteration_completed`, `worker.iteration_failed`, `worker.startup_failed`, `worker.runtime_failed`, `worker.shutdown_failed`, and `worker.once_completed`/`worker.once_failed`.

Empty polls remain silent. Completed work logs only existing aggregate numeric summaries. Failure events do not pass caught errors to the worker logger. Polling, failure backoff, bounded batch sizes, provider policy, lease/fencing behavior, graceful signals, cleanup, and exit codes are unchanged.

## Queue and worker visibility decisions

Inquiry outbox, Translation jobs, and AI fallback jobs have claim-oriented indexes from which bounded operational summaries could be built. They are intentionally absent from public health routes. A correctly authorized Operations read model/route would expand this foundation, so queue depth, running/leased counts, retryable failures, and oldest-age metrics remain deferred to `feature/monitoring-alerting`.

No persisted worker heartbeat currently exists. Adding one would require a new authoritative table, write cadence, expiry semantics, and migration. Process/container state plus structured lifecycle logs is sufficient for the initial Staging foundation, so persisted worker liveness is deferred and no migration is added.

## Security headers

All application responses receive:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
- `X-Frame-Options: DENY`

The existing Staging `X-Robots-Tag: noindex, nofollow, noarchive` policy remains unchanged. HSTS is deferred until TLS termination and subdomain policy are authoritative; `includeSubDomains`/`preload` is not safe to assume. Full CSP is deferred until a nonce/hash-compatible policy is designed for Next.js scripts, JSON-LD, images, fonts, and future integrations.

## Docker, environments, CI, and deferred monitoring

The Dockerfile is unchanged. Its minimal runtime has no `curl` or `wget`; no package is installed solely for `HEALTHCHECK`. Future Compose/reverse-proxy configuration can call the liveness route. Readiness remains available separately for rollout traffic gating.

The same image supports Staging and Production through the existing deployment contract. Neither health route contacts Telegram, Groq, OpenAI, or another network provider. CI retains the unchanged `Quality`, `Disposable PostgreSQL integration tests`, and `Production build` jobs and requires no new GitHub Secret.

Prometheus, Grafana, Loki, Tempo, OpenTelemetry collection, Sentry, uptime checks, hosted logs, alert routing, Compose, proxy/TLS, deployment workflows, release promotion, and rollback remain explicitly deferred.

## Validation record

| Check | Result |
| --- | --- |
| Focused health/logging/request-ID/security-header/worker tests | PASS: 13 files, 59 tests |
| `pnpm lint` | PASS: no warnings or errors |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: 217 files, 2,213 tests |
| `pnpm test:integration` | PASS: 13 files, 185 tests; guarded tmpfs-backed `postgres-test` container created and removed without deleting volumes |
| `pnpm db:check` | PASS: `Everything's fine`; Production mode with an isolated fake database URL prevented Development secret use |
| `pnpm build` | PASS: Next.js 16.3.0 Production build; 113 static pages; both health routes dynamic |
| Staging HTTP smoke | PASS: live/ready `200`, no-store, generated/preserved/replaced request IDs, safe version/revision, Staging robots policy, and baseline headers |
| Production HTTP smoke | PASS: live/ready `200`, no-store, and no Production `X-Robots-Tag` regression |
| Database-failure HTTP smoke | PASS: live remained `200`; ready returned `503`; the JSON log contained only request ID, failed check, error name, and `ECONNREFUSED` |
| `git diff --check` | PASS |

The built standalone server artifact could not be launched directly on this Windows checkout because its traced pnpm symlink graph returned `EPERM`. The bounded HTTP checks therefore used the installed Next.js `next start` runtime against the completed Production build. The Dockerfile and Linux standalone image inputs were unchanged, so no Docker rebuild was warranted.

The build process reported Next.js environment-file discovery, but every known database, Telegram, and provider credential variable was pre-set to a synthetic build-only value and no real credential value was consumed or emitted. No live provider, persistent Development database, persistent Docker volume, GitHub Secret, or preserved stash was accessed. All changes remain unstaged.
