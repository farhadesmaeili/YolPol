# Production Worker Runtime

## Goal and scope

This feature converts the three active background worker commands into independently runnable, long-running processes:

- Inquiry Notification
- Conversation Translation
- Conversation AI Fallback

It changes process lifecycle only. Existing business use cases, provider behavior, AI policy and emergency controls, translation safety, retries, leases, idempotency, transactional finalization, and Staff/Customer message semantics are unchanged. No database migration, deployment Compose service, web-container worker, health endpoint, deployment workflow, or real credential is added.

## Worker inventory and lifecycle

| Worker | Previous production command | Previous lifecycle | Production command | Preserved one-shot command |
| --- | --- | --- | --- | --- |
| Inquiry Notification | `pnpm worker:inquiry-notifications` | One bounded batch and exit | `pnpm worker:inquiry-notifications` | `pnpm worker:inquiry-notifications:once` |
| Conversation Translation | `pnpm worker:conversation-translation` | One bounded batch and exit | `pnpm worker:conversation-translation` | `pnpm worker:conversation-translation:once` |
| Conversation AI Fallback | `pnpm worker:ai-fallback` | One bounded batch and exit | `pnpm worker:ai-fallback` | `pnpm worker:ai-fallback:once` |

The Inquiry Development wrapper was already continuous. The Translation and AI Development wrappers previously ran one batch; all three `dev:*` worker commands now load the ignored Development environment before composition and then use the same continuous lifecycle as Production. The Development wrappers remain unavailable when `NODE_ENV=production`.

Each process creates exactly one worker runtime and one bounded PostgreSQL pool, runs non-overlapping bounded iterations, waits after every iteration, and closes its owned pool once at shutdown. Empty queues are normal: they produce no per-iteration log, wait for the configured interval, and poll again.

The established batch sizes remain unchanged:

- Inquiry Notification: at most 20 outbox events per iteration, with existing per-event recipient claim bounds.
- Conversation Translation: at most 10 jobs per iteration, claimed one at a time.
- Conversation AI Fallback: at most 10 jobs per iteration.

No new parallel provider execution is introduced.

## Polling and process failures

Production polling is optional server-only, non-secret configuration:

| Variable | Default | Accepted range |
| --- | ---: | ---: |
| `INQUIRY_NOTIFICATION_WORKER_POLL_MS` | 2000 ms | 500-60000 ms |
| `CONVERSATION_TRANSLATION_WORKER_POLL_MS` | 2000 ms | 500-60000 ms |
| `CONVERSATION_AI_FALLBACK_WORKER_POLL_MS` | 2000 ms | 500-60000 ms |

The existing `INQUIRY_NOTIFICATION_DEV_POLL_MS` remains a Development-only compatibility setting for `pnpm dev:inquiry-notifications`. Translation and AI Development wrappers use their corresponding worker polling variables.

Unexpected iteration failures emit a content-free structured event and wait before retrying. The process-level delay starts at the greater of five seconds or the configured poll interval, doubles for consecutive failures, and caps at 60 seconds. A successful iteration resets the failure delay. This pacing does not replace or alter job-level provider retry rules.

Malformed polling or required startup configuration fails before the polling loop with exit code `1` and a redacted event. Missing or invalid provider credentials remain conditionally resolved only after the authoritative Provider Registry selects an eligible profile; intentionally disabled or provider-free workers therefore do not require unrelated provider secrets at startup.

## Signals and database lifecycle

SIGTERM and SIGINT install one handler each per process. The first signal records a safe stopping event, prevents another iteration, and interrupts only the polling delay. An active bounded iteration is allowed to finish; its provider request may delay shutdown until the existing request/deadline timeout completes. The runtime then removes both handlers, ends its single PostgreSQL pool, records a stopped event, and returns exit code `0`. Startup, unrecoverable runtime, or pool-cleanup failure returns non-zero without calling `process.exit()` ahead of cleanup.

## Existing concurrency and safety

The runtime adds no in-memory/global lock. It preserves the database-owned multi-consumer protections:

- Inquiry outbox claims use transactional row locks with `SKIP LOCKED` and 60-second leases. Telegram delivery retry, permanent-failure, and ambiguous `UNKNOWN` outcomes remain authoritative.
- Translation claims use `FOR UPDATE SKIP LOCKED`, 60-second leases, three-claim recovery limits, lease-bounded provider execution, and fenced final writes.
- AI fallback claims use `SKIP LOCKED`, 60-second leases, three-claim recovery limits, persisted policy/control checks, and a final transactional Operations check immediately before Customer-visible message insertion.

A worker restart may leave an active lease until its existing expiry; compatible consumers can later recover it under the current persistence rules. Initial deployment can use one replica per worker without making single-process exclusivity a correctness assumption.

## Service configuration and secrets

- Inquiry Notification requires a valid deployment identity/application origin, `DATABASE_URL`, and exactly one `TELEGRAM_BOT_TOKEN` or `TELEGRAM_BOT_TOKEN_FILE` source.
- Conversation Translation requires a valid deployment identity and `DATABASE_URL`. The AI emergency override is optional/fail-closed; the selected provider credential is required only when an eligible job actually selects that provider.
- Conversation AI Fallback has the same deployment/database and conditional provider requirements as Translation, while retaining authoritative AI Operations policy and emergency-stop behavior.

No worker loads `.env.local` through a Production command. Existing `_FILE` support, direct/file ambiguity rejection, redacted secret errors, opaque credential references, and server-only boundaries remain intact. No real secret was accessed and no GitHub Secret is required.

## TypeScript and container execution

Workers continue to execute the repository TypeScript entrypoints through the existing production dependency `tsx`, but package scripts now launch Node directly:

```text
node --conditions=react-server --import tsx tooling/workers/<entrypoint>.ts
```

The direct Node process is suitable as a future container PID 1 and avoids requiring pnpm at runtime. The explicit `react-server` condition lets Node resolve the canonical zero-dependency `server-only` marker while preserving that marker's client-side guard. A future worker image must include Node, production dependencies (including `tsx` and `server-only`), the worker entrypoints, and their traced source graph.

The current Dockerfile remains intentionally unchanged: its final standalone image contains only the Next.js web runtime and cannot execute these workers. Dedicated worker image targets/services, Staging/Production Compose wiring, resource limits, and termination grace periods remain deferred to the deployment feature. Workers are not started in the web container.

## Deferred paths

`ProcessConversationChannelDeliveries` has a data-safe lease/fencing foundation but no active provider composition or runtime command. This feature does not invent or activate one. `pnpm retention:inquiries` remains a destructive, controlled one-shot administrative operation and is not converted into a polling worker.

Full worker health endpoints, last-successful-poll state, backlog metrics, failure metrics, and the broader logging system remain deferred to `feature/health-logging-observability`. Process-running state and safe lifecycle events are the only liveness signal added here.

The existing CI workflow and its `Quality`, `Disposable PostgreSQL integration tests`, and `Production build` job names remain unchanged. Tests use injected runtimes, signals, clocks/delays, and aggregate counters; they do not contact Telegram or an AI provider.

## Validation record

| Check | Result |
| --- | --- |
| Focused worker lifecycle and entrypoint tests | PASS: 5 files, 26 tests |
| `pnpm lint` | PASS: no warnings or errors |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS: 209 files, 2180 tests |
| `pnpm test:integration` | PASS: 12 files, 184 tests; guarded disposable `postgres-test` created and removed |
| `pnpm db:check` | PASS: `Everything's fine` |
| `pnpm build` | PASS: Next.js Production build, 113 generated pages |
| Worker entrypoint import smoke | PASS: all six continuous/one-shot entrypoints resolved through direct Node + `tsx` |
| Redacted startup-failure smoke | PASS: all three continuous commands returned `1` with database/provider variables explicitly absent and logged only their safe startup-failure event |
| `git diff --check` | PASS |

The first full unit run was intentionally performed concurrently with lint and hit the five-second timeout in two source-transformation tests; it otherwise passed 2178 tests. Both files passed immediately in the focused serial run, and the required full serial rerun then passed all 2180 tests. The initial sandboxed integration and Drizzle attempts encountered Windows Docker/profile permission errors; the same guarded, non-destructive checks passed when rerun with the required access.

No persistent Development database, Production/Staging data, provider API, Telegram API, or persistent Docker volume was used. The existing experimental stash was not inspected or changed. All repository changes remain unstaged.
