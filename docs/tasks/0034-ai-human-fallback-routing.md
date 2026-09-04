# AI Human / AI Fallback Routing

## Objective

Decide durably whether the basic YOLPOL fallback responder may answer one specific Website customer message. Human Staff always has priority. AI Operations continues to own global eligibility, the Provider Registry owns provider configuration, and the Provider Gateway owns execution, retry, failover, and circuit health.

## Durable lifecycle

Each eligible `CUSTOMER`/`WEBSITE` message creates at most one `conversation_ai_response_jobs` row in the same transaction as the message. `PENDING` jobs become `RUNNING` under a PostgreSQL lease and finish as `SUCCEEDED`, `CANCELLED`, `SUPERSEDED`, or `FAILED`. Legal transitions are `PENDING -> RUNNING|CANCELLED|SUPERSEDED`, `RUNNING -> PENDING|SUCCEEDED|CANCELLED|SUPERSEDED|FAILED`, with lease recovery limited to three claims. A provider failure is terminal for that turn; only an expired worker lease may return a job to `PENDING`.

The stable job ID derives stable `execution_id` and AI message identities. If a worker dies after provider success but before the final database commit, recovery can call the provider again because generated drafts are not persisted. The final customer-visible message nevertheless remains exactly once.

## Global scheduling semantics

Scheduling consumes a read-only AI Operations planning use case. `DISABLED`, emergency disable, missing/invalid policy, or an unavailable policy creates no executable job. `FALLBACK` schedules at the customer-message time plus the configured human grace period. `SCHEDULED` finds the earliest allowed instant at or after that grace deadline using the canonical normalized schedule and business timezone rules, including normalized overnight windows and week rollover.

Persisting `DISABLED` terminalizes active fallback jobs in the same policy transaction. Customer-message job insertion takes a shared lock on that policy row, so a concurrent disable either cancels the newly committed job or is observed before insertion. Re-enabling Operations therefore cannot resurrect work from the disabled interval.

The search horizon is 24 hours from the customer message. A window beyond that horizon creates no job, and a claimed job older than 24 hours is cancelled. This intentionally prevents replies from appearing days after the triggering turn. Operations is checked again immediately before generation and inside the final persistence callback; the final transaction also takes a shared lock on the global policy row so concurrent policy updates serialize with the customer-visible commit. Emergency configuration is always read fail-closed.

## Conversation serialization and human priority

Customer, Website Staff, Telegram Staff, control mutation, and AI finalization all lock the same `conversations` row before allocating positions or changing related jobs. A new customer message supersedes older `PENDING` or `RUNNING` jobs. An `INTERNAL_USER` message cancels applicable current-turn jobs but does not change persistent ownership.

AI finalization locks the Conversation, validates the lease token and trigger position, checks for a newer customer or later Staff reply, checks the per-Conversation control, rechecks global Operations, inserts one deterministic `AI_AGENT`/`WEBSITE` message, and marks the job `SUCCEEDED` in one transaction. Whichever Conversation transaction obtains the lock first defines the race outcome.

## Conversation control

A missing control row means `AUTO` version `0` and does not cause a write. Explicit Staff mutations create or update `conversation_ai_controls` with optimistic versioning and append an immutable `conversation_ai_control_events` record. `PAUSED` and `HUMAN_TAKEOVER` retain distinct audit/UI meanings and cancel current executable jobs. `AUTO` is restored only by Resume; Resume never resurrects old work and applies only to future customer messages.

`SUPER_ADMIN`, `ADMIN`, and `SALES` receive the explicit `mayControlConversationAi` capability. `VIEWER` remains read-only. Mutation requests use authenticated server-derived actors, exact Origin checks, exact bounded JSON, rate limiting, and optimistic versions.

## Basic responder and privacy boundary

The responder uses `TEXT_GENERATION` only, no tools or structured output. It maps `CUSTOMER` to `USER`, `INTERNAL_USER` and `AI_AGENT` to `ASSISTANT`, and excludes Conversation `SYSTEM` messages. Context is limited to 12 relevant messages and 12,000 aggregate characters. The server-owned policy identifies YOLPOL as a B2B wholesale glass-bottle supplier, keeps sales inquiry-only, and prohibits invented pricing, availability, delivery, legal/customs, payment, discount, or completed-action claims.

Jobs, controls, and audit rows contain routing metadata only. They contain no prompt, transcript, generated draft, provider request/response, or secret. Generated content is stored only if it wins finalization, as the normal durable Conversation message used by the existing Website SSE cursor.

The three routing tables use targeted cascade deletion from their owning Conversation (and jobs from their trigger message). This preserves the established Inquiry-retention deletion path and prevents derived routing metadata or Staff actor references from outliving the confidential Conversation; no unrelated parent or audit family is cascaded.

## Deployment and deferred scope

`pnpm worker:ai-fallback` is a one-shot independent worker. Its reusable factories are separated from the Next-only singleton wrappers so the standalone `tsx` process can load without weakening the request-facing `server-only` boundary. It is not started by Next.js or Development Compose. A separately supervised production worker service, with database and AI secret access, remains a deployment concern.

Conversation translation records/UI, AI Agent tools and business actions, and customer Telegram/Email/WhatsApp delivery remain deferred to their dedicated roadmap features.
