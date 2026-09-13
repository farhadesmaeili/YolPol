# Conversation Channel Foundation

## Scope

This feature adds a small provider-neutral foundation for future Customer-facing external conversation channels. It implements durable Channel Binding, normalized inbound text deduplication/correlation, outbound delivery state, a narrow `sendText` application port, and fake adapters for deterministic tests.

It does not connect a webhook, call a provider, create a Conversation from an external identity, or supervise a production worker. Existing Conversation Messages remain authoritative.

## Architecture

The `conversation-channels` feature follows the repository's five layers:

- domain: external-channel identities, binding validation, plain-text validation, and delivery lifecycle rules
- application: binding creation, inbound intake, delivery scheduling/processing, repository ports, and the provider-neutral outbound adapter
- infrastructure: Drizzle schema and one PostgreSQL repository for exact binding, dedupe, safe scheduling, claims, and lease-fenced finalization
- presentation: a safe binding presenter; there is intentionally no Staff UI
- testing: a fake outbound adapter

Provider SDK objects, HTTP requests, credentials, tokens, raw webhooks, headers, URLs, and arbitrary metadata do not enter domain/application contracts.

## Channel binding model

A binding maps one existing internal Conversation to an exact external identity:

`channel + providerKey + externalAccountReference + externalConversationReference + externalParticipantReference`

External identifiers are opaque, trimmed-by-rejection rather than interpreted, bounded to 160 characters, and reject whitespace, controls, markup delimiters, and URL-shaped values. Provider keys are bounded stable adapter identifiers. The database uniquely owns `(channel, provider_key, external_account_reference, external_conversation_reference)`, preventing the same external thread from being attached to a second internal Conversation even when a different participant value is presented.

Binding creation requires an existing Conversation. Resolution requires every identity component to match. It never performs fuzzy matching, contact matching, cross-customer merging, or automatic Conversation creation.

The foundation recognizes `TELEGRAM`, `INSTAGRAM`, `EMAIL`, and `WHATSAPP` as external binding channels. Instagram is not added to the existing Conversation Message channel enum in this task because inbound promotion is deliberately deferred.

These are distinct bounded contexts: binding destination versus authored Message origin. No cast or implicit conversion connects them. Future Instagram promotion requires an explicit extension of the authoritative Core enum and database checks; it must not pretend an Instagram message originated on another channel. Conversation and Message IDs use their existing Core value objects, including valid leading underscores/hyphens.

## Inbound flow and idempotency

Intended future flow:

External provider webhook
-> provider-specific infrastructure adapter
-> normalized inbound text message
-> Channel Foundation
-> durable idempotency check
-> exact binding resolution
-> existing Conversation Core
-> `CUSTOMER` Conversation Message
-> existing Translation / AI / Staff systems

The current use case validates exact identity, one opaque external message reference, one provider occurrence time, and plain text of at most 10,000 characters. It stores no raw provider JSON. `(binding_id, external_message_reference)` is unique. An identical redelivery returns the original intake identity; the same provider reference with altered body or occurrence time is a conflict.

The intake row has a nullable foreign-keyed `correlated_message_id`, but this feature does not promote intake rows into Conversation Messages. Promotion must be added atomically with the existing Conversation Core writer so a crash cannot leave a created message without correlation or correlation without a message. That future transaction must allocate the normal durable position, create exactly one `CUSTOMER` message, schedule existing translation and AI fallback behavior, and then set correlation. Until that integration exists, unresolved bindings return explicitly and no Conversation Message is created. This preserves Conversation invariants rather than introducing a second message model or parallel AI route.

## Outbound flow and idempotency

Intended future flow:

Existing Customer-visible Conversation Message
-> Channel Delivery
-> provider-neutral outbound adapter
-> provider-specific adapter
-> external channel

Scheduling references the existing Message and binding; it does not copy message content into the delivery table. `(message_id, binding_id)` is unique, so repeated scheduling returns the existing logical delivery. Composite foreign keys guarantee that the binding and message belong to the recorded Conversation.

Only `INTERNAL_USER` and `AI_AGENT` messages can be scheduled. Customer and System messages are not outbound candidates. The PostgreSQL boundary reads the safe body from the existing Translation tables and refuses scheduling when source/target language is unknown, translation is pending/failed/cancelled, delivery is skipped, or an earlier known cross-language reply forms the existing safe-prefix barrier. Claims repeat the same checks and return either the same-language original or the successful Customer-target translation; authored Message bodies remain unchanged.

The delivery lifecycle is:

- `PENDING`: available for a bounded claim
- `RUNNING`: leased with a fenced token; attempts increment at claim
- `DELIVERED`: terminal with one opaque provider message reference
- `FAILED`: terminal after a permanent failure or the third confirmed-retryable attempt
- `UNKNOWN`: terminal when a send outcome is ambiguous or a running lease expires

The maximum is three attempts. Confirmed retryable failures use bounded exponential delay. An adapter throw is treated as an unknown outcome, not automatically retried, because the provider may have accepted the send before the connection failed. A stable delivery ID is passed as the provider-neutral idempotency reference; a future adapter may use it when its provider supports idempotency. Lease-token and expiry predicates reject stale finalization.

Before each send, the worker checks its local deadline, then asks PostgreSQL to confirm current RUNNING status, lease token, stored expiry, and Customer-safe eligibility including the safe prefix. It checks the deadline again after that query. Expired RUNNING rows are terminalized as UNKNOWN, never reclaimed for a second send. No lease is extended. Claim attempts count reservations, including reservations that expire before dispatch; they do not prove a provider invocation occurred.

Invalid outbound text is rejected per delivery before the adapter is invoked, as FAILED / INVALID_REQUEST. It neither rolls back other claims nor strips markup into replacement content. Conversation bodies remain unchanged. An UNKNOWN_OUTCOME category always takes the conservative unknown path, even if an adapter incorrectly labels it retryable. RETRYABLE_FAILURE and PERMANENT_FAILURE require confirmed non-acceptance; providers must have text/markup parsing disabled by their future adapter.

## Provider-neutral outbound port

`ConversationChannelOutboundAdapter.sendText` receives only the binding identity, customer-safe text, and stable logical delivery identity. It returns either a bounded opaque provider message reference or a typed retryable, permanent, or unknown failure. Provider-specific error payloads and response bodies are not persisted.

No real adapter or routing registry is included. A composition root can later supply one channel/provider adapter without changing domain types or persistence.

## Plain-text and security boundary

Supported now: bounded plain text.

Not supported: HTML, attachments, images, documents, audio, voice, reactions, typing indicators, read receipts, editing, deletion, rich cards, or buttons.

The schema stores only normalized identifiers, normalized inbound text, correlation IDs, lifecycle state, safe failure categories, timestamps, lease data, and an opaque confirmed provider reference. It has no provider payload, arbitrary JSON metadata, credential, token, secret reference, arbitrary header/URL, pricing, supplier cost, margin, or quotation field.

## Translation relationship

Conversation Translation remains authoritative. The Channel Foundation neither translates nor falls back to authored Staff text. Delivery scheduling and claiming reproduce the existing customer-safe eligibility and safe-prefix barrier from `PostgresCustomerMessageReader`. A future scheduler should invoke `ScheduleConversationChannelDelivery` only when the Customer-safe projection exposes a new Staff/AI message; a successful translation retry therefore schedules the original Message identity and translated body at its original position.

## AI and human routing relationship

The foundation does not change `AUTO`, `PAUSED`, `HUMAN_TAKEOVER`, Staff precedence, newer-Customer supersession, Agent finalization, or Conversation Message rules. It creates no AI job and no alternate response path. Future inbound promotion must call the existing authoritative Customer-message transaction, extended deliberately for the external channel, so existing routing checks and races continue to apply.

AI Agent messages remain compatible because outbound scheduling accepts `AI_AGENT` only after the authoritative customer-target locale projection is safe.

## Database model

Migration `0020_conversation_channel_foundation.sql` adds:

- `conversation_channel_bindings`
- `conversation_channel_inbound_messages`
- `conversation_channel_deliveries`
- a composite unique index on existing `conversation_messages(id, conversation_id)` used only to support same-Conversation composite foreign keys

The migration is additive. It does not alter or delete existing data and is not applied to Development by this task.

The composite unique index is necessary for the composite foreign keys: a standalone globally unique Message ID does not let PostgreSQL validate the pair `(id, conversation_id)` as a referenced key. Existing primary-key uniqueness makes duplicate pairs impossible. This index preserves Message identity, positions, bodies, and writer semantics while preventing cross-Conversation binding/message/correlation mismatches. It is created before dependent foreign keys. A normal index build blocks writes on the existing Message table, so future production deployment needs an assessed maintenance window or a separately designed concurrent-index rollout. No production-oriented migration redesign is included here.

The SQL checks now reject whitespace/control/markup/URL-shaped external references, invalid provider references, blank/oversized/control-containing/HTML intake text, exhausted PENDING rows, partial or malformed leases, RUNNING rows with failure reasons, and UNKNOWN without UNKNOWN_OUTCOME. The third confirmed retryable failure becomes FAILED atomically; attempts are not reset. Nullable outcome checks explicitly account for PostgreSQL accepting a CHECK expression that evaluates to NULL.

Foreign keys cascade with Conversation retention. Individual deletion of bindings or correlated messages also deletes their delivery/intake records; no such application operation is exposed. A future selective deletion or manual recovery feature must preserve replay history and audit evidence. All new indexes support identity uniqueness, FK referenceability, or expected conversation/history/due reads. The due index is usable for current pending claims; a separate expired-lease index or FK cleanup index needs measured scale evidence before being added.

## Independent audit findings and limitations

The audit reproduced and corrected SQL identifier/outcome gaps, malformed-body batch rollback, expired-batch invocation, contradictory retry/UNKNOWN behavior, partial lease reconstitution, and exhausted PENDING acceptance. It additionally corrected Core ID grammar incompatibility, Linux-vacuous architecture tests, and pre-send safe-prefix revalidation after an earlier unknown language is confirmed.

Inbound replay compares normalized text and the provider's original occurredAt instant, at JavaScript millisecond precision. receivedAt and newly generated intake IDs do not change equivalence. First successful insertion wins concurrent conflicts; the winner is timing-dependent, but the loser cannot overwrite it. Future provider adapters must reuse a stable occurrence timestamp, not receipt time or a freshly generated timestamp. This conservative behavior is intentional until a concrete provider's normalization contract exists.

UNKNOWN is a delivery status; UNKNOWN_OUTCOME is its required failure category. Provider success followed by a crash or failed persistence remains uncertain, as does an arbitrary adapter throw. A provider-reference uniqueness collision leaves the first confirmation intact and terminalizes the competing delivery as UNKNOWN. There is no automatic UNKNOWN recovery or current Staff recovery UI. Future reconciliation must update the same logical delivery with provider evidence and appropriate authorization/auditing; blindly resetting UNKNOWN or creating a replacement ID would defeat duplicate protection.

Database preflight and remote sends cannot form one atomic transaction. The foundation does not promise provider-level exactly-once delivery, total order between independently claimed safe replies, or cancellation of an already-started provider request. Synchronized clocks and bounded adapter execution are required for future worker composition. A delivery withheld at preflight is conservatively left for lease expiry recovery. Provider-specific idempotency, reconciliation, integration credentials, and supervision remain deferred.

Translation scheduling, claims, and pre-send checks mirror the existing Customer reader. Pending/failed/cancelled/missing cross-language translations block; unknown/SYSTEM and SKIPPED rows remain hidden gaps; successful Customer-target translations and genuinely same-language Staff/AI text are eligible. These duplicated SQL predicates need parity maintenance when the authoritative projection changes. No translation engine or alternate routing path was added.

The four pre-existing integration-test modifications only add the new child tables to disposable cleanup lists and update schema/migration expectations to 21 migrations. No old behavioral assertion was removed or weakened. All live provider behavior, Development migration behavior, production-scale locking, and manual recovery remain untested by design.

## Explicitly deferred

NOT IMPLEMENTED YET:

- Telegram Customer integration or Bot API
- Instagram integration, Graph API, OAuth, or webhook
- Email integration, SMTP, IMAP, or Gmail
- WhatsApp integration or Cloud API
- any provider webhook or provider OAuth flow
- provider credential/token persistence or UI
- inbound promotion into Conversation Core
- automatic delivery scheduling from a projection event
- attachments or media of any kind
- production worker composition, command, or Docker supervision
- CRM, quotations, outreach, follow-up automation, analytics, or lead scoring

## Final independent audit decision (2026-09-06)

**PASS WITH FIXES**, for the provider-neutral foundation scope only. No remaining blocker was found. This is not approval of a live provider integration or production deployment.

All earlier audit corrections were retained. The second pass strengthened the local lease-deadline fix with PostgreSQL ownership/eligibility checks and a post-query deadline check. Malformed text validation remains outside claim transactions, before each individual adapter call. No audit fix was reverted. Additional fixes cover Core ID compatibility, schema/application safety parity, pre-send translation barriers, and portable architecture-test discovery.

### Outbound race assessment

| Scenario | Verified behavior |
| --- | --- |
| A: concurrent schedule of message + binding | Unique index admits one row; the other call returns its existing delivery ID. |
| B: concurrent claims | Row locks with SKIP LOCKED admit one claim and increment attempts once. |
| C: stale finalization | PostgreSQL UPDATE checks RUNNING, exact token, and unexpired stored lease; all four finalizers reject the prior token. |
| D: lease expires before invocation | Later batch items are withheld; another worker terminalizes expired rows as UNKNOWN and never leases them for another send. |
| E: provider accepts, process fails before confirmation | No confirmed DB outcome is invented; expiry becomes UNKNOWN without automatic resend. |
| F: definitely failed before send | Invalid text becomes FAILED / INVALID_REQUEST. A typed confirmed-not-accepted retryable result uses bounded retries; an untyped throw cannot prove non-acceptance. |
| G: ambiguous outcome | UNKNOWN / UNKNOWN_OUTCOME, terminal; contradictory retryable + UNKNOWN_OUTCOME also cannot retry. |
| H: duplicate provider message reference | Unique per binding. First DELIVERED stays intact; competing finalization fails uniqueness and the worker records UNKNOWN. |
| I: retry after delivery | Delivered rows cannot be claimed or rescheduled by a finalizer. Scheduling still references the same logical delivery. |
| J: maximum attempt | Third confirmed retryable failure atomically becomes FAILED. SQL rejects PENDING at three attempts; there is no reset or fourth claim. |
| K: mixed malformed/valid batch | Invalid message fails individually before send; valid messages still progress. |

Binding creation and inbound replay were exercised concurrently against real disposable PostgreSQL. Exact participant mismatch remains unresolved; same external thread with another participant cannot create another binding. Case and channel/account/provider scope remain distinct. No intake promotion or duplicate Customer Message is performed.

Clean Architecture review found all five layers populated, provider-neutral domain/application contracts, no presentation dependency in infrastructure operation, and no new composition root, route, webhook, provider SDK, credential store, or alternate Conversation writer. Security search hits are neutral channel names, safe failure categories, internal lease tokens, validation expressions, and test rejection fixtures. No pricing, raw provider payload, or arbitrary metadata fields were introduced. The existing AI/Staff writer and finalizer continue to own locale selection, positions, grace periods, control state, Staff precedence, and supersession.

### Validation evidence

| Command/check | Final result |
| --- | --- |
| `pnpm exec vitest run src/features/conversation-channels` | PASS: 5 files, 30 tests |
| `node tooling/testing/.audit-channel-integration.mjs` | PASS: 1 file, 26 PostgreSQL tests; temporary copy of the existing harness with only the Vitest file filter changed, then removed |
| `pnpm lint` | PASS, exit 0 |
| `pnpm typecheck` | PASS, exit 0 |
| `pnpm test` | PASS: 186 files, 1,991 tests |
| `pnpm test:integration` | PASS: 12 files, 152 tests |
| `pnpm db:check` | PASS, exit 0; metadata check only |
| `pnpm build` | PASS, exit 0; 109 generated pages |
| Snapshot structural comparison | PASS: exactly 3 added channel tables; only existing-table difference is the Message composite index; previous snapshot ID matches |
| Drizzle/schema/SQL constraint parity | PASS: all channel check expressions matched in focused unit tests |
| Untracked trailing-whitespace scan | PASS: no findings |

Initial regressions intentionally failed: three unit cases and seven PostgreSQL cases reproduced defects before correction. A later barrier regression initially failed because its fixture used the normal writer's default Staff locale; the fixture was corrected to represent a historical unknown row and passed. Initial Docker and Drizzle invocations failed sandbox permissions/OS user lookup; their final executions succeeded outside the sandbox. No check failure was hidden or weakened to pass.

Integration runs used only the inspected postgres-test service on tmpfs and its hard-guarded test database. No Development migration/data mutation, provider call, Docker volume deletion, branch switch, staging, commit, or push was performed. Git emitted an environmental warning about the inaccessible global ignore file; repository inventory still completed successfully.

Remaining non-blocking risks are production-scale migration locking, measured indexing/performance, eventual provider timeout/idempotency/reconciliation contracts, preserving dedupe during future selective deletion/manual recovery, and maintaining projection predicate parity. Same-Conversation FKs do not prove provider ownership or validate cross-table sender/locale business rules; those remain application/repository responsibilities. Current binding creation is an internal use case with no public entry point; authorization must be composed before exposing it.

PostgreSQL references: [constraint NULL semantics and composite FK targets](https://www.postgresql.org/docs/18/ddl-constraints.html), [normal index build write blocking](https://www.postgresql.org/docs/18/sql-createindex.html).


### Final worktree inventory

32 changed files: 7 tracked modifications, 25 untracked files, 0 staged files. Branch: `feature/conversation-channel-foundation`; HEAD: `e8859ca`.

`git status --short`:

```text
 M drizzle.config.ts
 M drizzle/meta/_journal.json
 M src/features/conversation-ai-routing/infrastructure/__tests__/postgres-conversation-ai-routing-repository.integration.test.ts
 M src/features/conversation-translation/infrastructure/__tests__/postgres-translation.integration.test.ts
 M src/features/inquiries/infrastructure/__tests__/postgres-inquiry-repository.integration.test.ts
 M src/features/inquiries/infrastructure/__tests__/postgres-telegram-delivery-repository.integration.test.ts
 M src/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema.ts
?? docs/tasks/0038-conversation-channel-foundation.md
?? drizzle/0020_conversation_channel_foundation.sql
?? drizzle/meta/0020_snapshot.json
?? src/features/conversation-channels/
```

Complete inventory (`M` = tracked modification, `??` = untracked):

```text
M  drizzle.config.ts
M  drizzle/meta/_journal.json
M  src/features/conversation-ai-routing/infrastructure/__tests__/postgres-conversation-ai-routing-repository.integration.test.ts
M  src/features/conversation-translation/infrastructure/__tests__/postgres-translation.integration.test.ts
M  src/features/inquiries/infrastructure/__tests__/postgres-inquiry-repository.integration.test.ts
M  src/features/inquiries/infrastructure/__tests__/postgres-telegram-delivery-repository.integration.test.ts
M  src/features/inquiries/infrastructure/persistence/postgres/schema/inquiry-schema.ts
?? docs/tasks/0038-conversation-channel-foundation.md
?? drizzle/0020_conversation_channel_foundation.sql
?? drizzle/meta/0020_snapshot.json
?? src/features/conversation-channels/application/__tests__/conversation-channel-use-cases.test.ts
?? src/features/conversation-channels/application/dto/conversation-channel-dto.ts
?? src/features/conversation-channels/application/ports/conversation-channel-ports.ts
?? src/features/conversation-channels/application/use-cases/create-conversation-channel-binding.ts
?? src/features/conversation-channels/application/use-cases/process-conversation-channel-deliveries.ts
?? src/features/conversation-channels/application/use-cases/record-inbound-channel-text.ts
?? src/features/conversation-channels/application/use-cases/schedule-conversation-channel-delivery.ts
?? src/features/conversation-channels/domain/__tests__/conversation-channel-domain.test.ts
?? src/features/conversation-channels/domain/entities/conversation-channel-binding.ts
?? src/features/conversation-channels/domain/entities/conversation-channel-delivery.ts
?? src/features/conversation-channels/domain/entities/normalized-inbound-channel-message.ts
?? src/features/conversation-channels/domain/errors/conversation-channel-errors.ts
?? src/features/conversation-channels/domain/types/conversation-channel-types.ts
?? src/features/conversation-channels/domain/value-objects/conversation-channel-values.ts
?? src/features/conversation-channels/infrastructure/__tests__/conversation-channel-boundaries.test.ts
?? src/features/conversation-channels/infrastructure/__tests__/conversation-channel-migration.test.ts
?? src/features/conversation-channels/infrastructure/__tests__/postgres-conversation-channel-repository.integration.test.ts
?? src/features/conversation-channels/infrastructure/persistence/postgres/repositories/postgres-conversation-channel-repository.ts
?? src/features/conversation-channels/infrastructure/persistence/postgres/schema/conversation-channel-schema.ts
?? src/features/conversation-channels/presentation/__tests__/conversation-channel-binding-presenter.test.ts
?? src/features/conversation-channels/presentation/presenters/conversation-channel-binding-presenter.ts
?? src/features/conversation-channels/testing/fakes/conversation-channel-fakes.ts
```

`git diff --stat` (tracked files only):

```text
 drizzle.config.ts                                                 | 1 +
 drizzle/meta/_journal.json                                        | 7 +++++++
 ...ostgres-conversation-ai-routing-repository.integration.test.ts | 2 +-
 .../__tests__/postgres-translation.integration.test.ts            | 2 +-
 .../__tests__/postgres-inquiry-repository.integration.test.ts     | 8 ++++----
 .../postgres-telegram-delivery-repository.integration.test.ts     | 2 +-
 .../infrastructure/persistence/postgres/schema/inquiry-schema.ts  | 1 +
 7 files changed, 16 insertions(+), 7 deletions(-)
```

`git diff --check`: PASS, exit 0; no whitespace findings. Untracked files were checked separately.
