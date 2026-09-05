# Conversation Translation final audit

## Result

CONVERSATION TRANSLATION FINAL AUDIT PASSED WITH DEFERRED NON-BLOCKING WARNINGS — READY FOR STAGING

The existing feature is complete with explicit Staff remediation for blocked Customer
delivery. The audit continued the uncommitted implementation without restarting it.
No implementation blocker remains. Migration deployment, worker supervision, manual
browser/device acceptance and live linguistic validation are separate deployment work.

## Language, architecture and provider boundary

The five feature layers remain domain, application, infrastructure, presentation and
testing. App Router consumes a composition root; application code depends on ports,
not PostgreSQL, Next.js or SDKs. Translation has no Product/pricing, agent, tool,
retrieval or channel-ingestion authority.

Website Customer language comes from a validated same-origin localized Referer,
falling back to the latest durable Website Customer locale and then inquiry locale.
Request JSON cannot set it. New Staff Website/authorized Telegram replies use the
central Persian working-language policy, independently of Staff UI locale. Existing
basic AI replies use their authoritative Customer trigger locale. Each outbound
message captures its Customer target under the Conversation write lock; later
Customer locale changes affect future replies without retargeting old messages.

Original message, language metadata, translations and jobs commit atomically.
The immutable authored body is never rewritten. Same-language Customer delivery
uses that original; otherwise only a successful translation can be projected.
Inbound Customer content may separately be translated for Staff.

The Gateway capability is TRANSLATION. Only one source message plus a server-owned
translation instruction is sent, with no transcript, tools or business data lookup.
The instruction treats message content as untrusted data, preserves identifiers,
numbers and commercial meaning, and requests translation only. Complete bounded
plain-text output is validated; tests do not establish live linguistic fidelity.
Registry eligibility, credentials and Gateway provider retry/failover remain existing
responsibilities. Only the emergency override denies translation work; AI Operations
schedules/modes and Human/AI routing govern fallback, not authored-message translation.

## Explicit remediation contract

| State/action | Customer behavior and lifecycle |
| --- | --- |
| PENDING / RUNNING | Hold the message and all later server-projected content until safe. Staff sees progress and the delivery blocker. Explicit skip is available. |
| FAILED | Remains a barrier. Staff must explicitly retry or skip. Failure details remain generic in UI. |
| CANCELLED | Terminal worker cancellation, currently used for the emergency override. It is still a delivery barrier and offers explicit retry or skip. It never implies intentional Customer suppression. Other Gateway failures, including execution cancellation, finalize FAILED. |
| RETRY | Atomically transitions the existing FAILED/CANCELLED translation and its existing job to PENDING. Keeps unique (messageId, targetLocale), clears failure and lease fields, resets bounded recovery attempts, increments versions, and records an event. |
| Repeated retry failure | Returns to a blocked terminal state. Another explicit Staff click is required; there is no automatic terminal-failure retry loop. |
| SKIPPED | Separate terminal message-language delivery state. Original remains in Staff history; neither original nor translation is ever projected to Customer. Later safe messages can progress. No unskip transition is exposed, and a database trigger prevents revival. |
| Skip during work | Cancels PENDING/RUNNING jobs/translations and clears leases. An already-running provider call may finish within its cancellation budget, but its result cannot finalize or become visible. FAILED records may remain FAILED internally while delivery is explicitly SKIPPED. |
| Already Customer-safe message | Skip is rejected so content that may already have been seen cannot be retracted. |
| UNKNOWN | Remains fail closed with a visible blocker. Staff can confirm a supported source language or explicitly skip. No AI/text detection is used. |
| CONFIRM_LANGUAGE | Only an unknown Staff/AI source can be confirmed, with exactly en/tr/fa/ar. Target comes from persisted metadata or preceding trusted Customer/inquiry locale. Translation/job rows are scheduled atomically if needed; the authored message is unchanged. Repeat confirmation is rejected. SYSTEM content can be skipped, never language-confirmed into Customer delivery. |

Each successful explicit retry gets a new stable Gateway execution ID derived from
its audit event UUID. This identifies a new user-authorized logical execution,
avoiding reuse of a terminal Gateway execution. Crash recovery retains that new ID;
Gateway alone owns internal provider retries/failover. The same translation ID and
message ID remain unchanged. Duplicate/stale version requests return conflict.

Claims retain FOR UPDATE SKIP LOCKED, a 60-second lease, random lease tokens and
at most three crash-recovery claims per explicit execution. The advisory lock is
keyed by the stable translation ID, including across retries. Gateway cancellation
is capped at 45 seconds and further reduced by elapsed pool/query wait and a
five-second finalization reserve. Finalization checks status, token and expiry.
Retry/skip cannot allow old attempts to finalize or overlap provider execution.
No live worker or provider was run for this audit.

## Staff authorization, audit and UI

POST /api/staff/inquiries/[inquiryId]/messages/[messageId]/translation uses existing
Staff sessions and mayReplyToCustomerConversation. SUPER_ADMIN, ADMIN and SALES
can remediate; VIEWER has status visibility without mutation controls. Server-side
authorization remains mandatory. Actor is derived from the authenticated principal.
The endpoint requires exact Origin, no query parameters, JSON content type, a
1 KiB body limit and an exact discriminated action payload. It accepts IDs/version
and the action's supported locale only, never source body, actor, role or target
locale for language confirmation. Errors are safe and responses are no-store.

All successful retry, skip and language-confirmation actions write a content-free
event in the same transaction: message ID, optional translation ID, action, derived
actor, timestamp, safe previous/new state and message-language CAS versions.
No duplicate body, prompt, raw provider payload or credential enters the audit.
UPDATE/direct DELETE is blocked by an append-only trigger; parent-message/inquiry
retention deletion cascades legitimately. Concurrent duplicate requests yield one
action/event. Skipped delivery cannot be silently revived at the database boundary.

Staff sees authored originals, translations, progress/failure/cancellation, an explicit
Customer-delivery blocker, and the terminal not-delivered label. Retry is explicit;
skip requires a separate confirmation. Source language requires an explicit selection.
Readiness says ready for delivery, never delivered/read. Refresh preserves drafts,
submission state and new messages. Pending translation state refreshes every five
seconds through the existing authenticated Staff page.

New text has en/tr/fa/ar parity. Labels and source-language options are localized;
translated text sets its own lang and RTL for fa/ar, LTR for en/tr. The surrounding
locale-aware layout and logical spacing remain unchanged. Rendered-markup checks
passed; interactive browser/mobile/RTL E2E was not performed.

## Customer history, SSE and performance

History and SSE share the same safe barrier query and application projection.
An unresolved outbound barrier is evaluated even before a supplied cursor, so a
caller cannot bypass a failed/unknown reply. Explicitly skipped messages are omitted
before projection. Original positions remain durable; history does not invent new
contiguous positions. Legacy positionless DTOs remain readable without fabricating
positions. Current production history includes real positions.

For 10 Customer / 11 failed Staff / 12 Customer / 13 successful Staff:

- Before resolution, history/SSE expose only 10.
- Skip 11: expose 10, 12, 13; never expose 11's original or translation.
- Retry 11: keep it held until success, then expose 10, 11, 12, 13 in order,
  using the translation at 11. A second failure remains held.
- SSE event IDs are original positions. After delivery at 13, cursor 13 produces
  no duplicate event. A skipped tail needs no synthetic event; the next eligible
  higher position advances the cursor safely.
- Client reconciliation deduplicates by message ID and sorts durable positions,
  including when a delayed translation precedes a locally acknowledged Customer
  message. Staff original records are preserved independently.

Customer reads use two queries per request/poll, not per-message queries: resolve
Conversation, then find the barrier and fetch bounded eligible rows. The barrier
uses ordering/locale/status metadata, never unbounded source/translation bodies.
Successful status implies valid non-null body through the database constraint.
Initial history fetches at most 1,000 safe messages; existing SSE replay fills any
remaining history in batches capped at 100. SQL LIMIT bounds body materialization.

Supporting indexes are the Conversation inquiry unique index, Conversation message
(conversation_id, position) unique index, language message PK, translation
(message_id, target_locale) unique index, job claim index and audit message/time
index. The query uses one barrier aggregate and indexed identity/order joins;
there is no correlated body fetch or N+1 translation query. A 1,011-message fixture
verifies history/replay limits and exactly two queries. Staff SSE translation reads
are restricted to the fetched message IDs, with no translation query on empty polls.
The existing full Staff detail history is the remaining unpaginated presentation.

Deferred scaling: barrier metadata work remains linear in Conversation length;
large-history load testing, a materialized delivery watermark and pagination of
the existing Staff history are future work. No production-volume benchmark or
EXPLAIN ANALYZE was claimed. Bounded Customer body fetching removes the prior
unbounded full-body polling behavior without a broad persistence redesign.

## Migration and existing Conversations

Only unapplied 0018_conversation_translation.sql and its snapshot/journal were
updated. It adds four tables: conversation_message_languages,
conversation_message_translations, conversation_translation_jobs and
conversation_translation_events. Snapshot parent is 0017; existing table definitions
and all previous journal entries are unchanged. SQL/snapshots 0000 through 0017 are unchanged.
The translation unique index is created before the composite job foreign key.
Constraints enforce locales, unique identities, valid bodies/statuses, leases,
bounded recovery attempts, versions and audit metadata. Audit and terminal-skip
triggers are included in 0018. No 0019 or Development-specific data is introduced.

Backfill joins existing message -> Conversation -> Inquiry. Historical Website
Customer source uses trusted inquiry.source_locale. Staff/AI Customer targets use
that same durable context, but their authored source remains NULL. Other unsupported
historical sources remain unknown. No text guessing, provider execution or historical
translation job backlog is introduced by migration.

Immediately after deployment, originals remain intact and Staff-visible. Customer
messages remain eligible, but later content behind an unknown historical reply is
intentionally held under the selected fail-closed policy. Previously displayed
Staff replies may therefore be withheld on reload until Staff confirms their source
language or skips them. This is deliberate and visible, not an unresolvable deadlock
or a claim that their historical language was known. Operators must reconcile these
visible blockers using Staff UI. Future replies use the latest authoritative Customer
locale. The exact 0018 SQL was tested over pre-feature-style originals in disposable
PostgreSQL, then history/SSE, confirmation, skip and future locale behavior verified.

## Validation and security evidence

| Check | Final result |
| --- | --- |
| Focused Vitest command (translation, customer client/state, Staff draft, routing, Registry, worker) | 12 files, 87 tests passed |
| pnpm lint | Passed |
| pnpm typecheck | Passed |
| pnpm test | 177 files, 1,853 tests passed |
| pnpm test:integration | 11 files, 115 tests passed on disposable PostgreSQL; guarded harness removed the tmpfs test container afterward |
| pnpm build | Passed; 109 static pages generated; remediation route included |
| pnpm db:check | Passed; read-only snapshot check with Development env loading disabled and disposable test URL supplied |
| git diff --check | Passed; untracked files separately checked for trailing whitespace/EOF |

Earlier sandbox failures were environmental: Docker access denied and Drizzle
uv_os_get_passwd ENOMEM. The necessary escalated guarded/read-only commands passed.
Intermediate locale-formatting and TypeScript test-fixture defects were corrected
before the final successful suite. All final claims above refer to completed runs.

Deterministic tests cover failed barriers; retry success/failure; unique retry
identity; stale/duplicate versions; stale leases after retry/skip; cancelled
remediation; historical migration; unknown confirmation/skip; append-only audit,
retention cascades and skip revival guards; exact Origin/JSON/authentication;
VIEWER denial/actor spoofing; history/SSE parity and cursor gaps; bounded reads;
45s/60s lease budgets; and preserved Staff drafts. No timing sleeps or live providers
are used for remediation tests.

AUTO, PAUSED and HUMAN_TAKEOVER controls, grace timestamps, CANCELLED fallback jobs
and SUPERSEDED fallback jobs remain byte-for-byte equivalent in database regression
fixtures after retry, skip and source confirmation. Translation remediation creates
no autonomous fallback response and does not change Inquiry workflow.

Tracked additions and complete untracked files were audited for credential values,
connection URLs, Authorization/Bearer/password bindings, private IPs, devtunnels,
local paths, debug logging, message/prompt/provider logging and pricing symbols.
No credentials/live connection values or content logging were added. Reviewed
matches are schema password-hash metadata, authorization symbol names, test fixture
configuration, generic worker errors/count-only summaries, and document/test prose.
There is no internalUnitPrice, supplier-cost, margin/markup, Offer/AggregateOffer or
priceCurrency access in translation implementation. .env.local was not printed or
inspected; .env.example's independent two-line edit was preserved.

No browser/device/live-model E2E, production supervision, deployment or migration to
Development was performed. External provider calls = 0. Development mutations = 0.
Staged files = 0. Commits = 0. Pushes = 0. No branch or HEAD changes.

## Remaining warnings and deferred scope

No implementation blockers remain. Non-blocking warnings are manual browser/device
acceptance, live linguistic fidelity/real-provider validation, deployment-time
historical-blocker reconciliation, and the scaling work described above. Production
migration and worker supervision require separate deployment work; this audit grants
no deployment or provider-call authority.

AI Agent tools/retrieval/planning, pricing/offer authority, Instagram, Telegram
Customer ingestion, Email/WhatsApp ingestion, general language detection, CRM,
outreach and sales automation remain deferred and unimplemented.

## Final repository state and complete inventory

Branch: feature/conversation-translation.
HEAD: 69b7002c2be5410f9fca33ec6f804ff30fbd78a0.
Worktree: 43 feature-modified tracked files, 37 added feature
files, plus independent .env.example modification (two added lines). Nothing staged.
Git status reports 45 tracked modifications and 37 untracked files. Of those tracked
entries, 44 have substantive diffs; conversation-message-dto.ts is also reported by
Git status but has no diff and its blob hash exactly matches HEAD. No content change
is present in that DTO, and the index was not refreshed or staged to hide the entry.

### Modified feature files

- `drizzle.config.ts`
- `drizzle/meta/_journal.json`
- `package.json`
- `src/composition/inquiries/customer-conversation-stream.ts`
- `src/composition/inquiries/customer-message.ts`
- `src/features/ai-provider-registry/application/__tests__/ai-provider-registry-use-cases.test.ts`
- `src/features/conversation-ai-routing/application/__tests__/conversation-ai-routing-use-cases.test.ts`
- `src/features/conversation-ai-routing/application/use-cases/generate-basic-conversation-ai-response.ts`
- `src/features/conversation-ai-routing/domain/types/conversation-ai-routing-types.ts`
- `src/features/conversation-ai-routing/infrastructure/__tests__/postgres-conversation-ai-routing-repository.integration.test.ts`
- `src/features/conversation-ai-routing/infrastructure/persistence/postgres/repositories/postgres-conversation-ai-routing-repository.ts`
- `src/features/inquiries/application/dto/customer-message-dto.ts`
- `src/features/inquiries/application/dto/staff-conversation-message-dto.ts`
- `src/features/inquiries/application/mappers/conversation-message-dto-mapper.ts`
- `src/features/inquiries/application/ports/conversation-ports.ts`
- `src/features/inquiries/application/results/get-conversation-message-history-result.ts`
- `src/features/inquiries/application/use-cases/get-conversation-message-history.ts`
- `src/features/inquiries/application/use-cases/get-team-inquiry-detail.ts`
- `src/features/inquiries/application/use-cases/read-new-conversation-messages.ts`
- `src/features/inquiries/application/use-cases/receive-customer-message.ts`
- `src/features/inquiries/domain/entities/message.ts`
- `src/features/inquiries/domain/types/conversation-types.ts`
- `src/features/inquiries/infrastructure/__tests__/postgres-inquiry-repository.integration.test.ts`
- `src/features/inquiries/infrastructure/__tests__/postgres-telegram-delivery-repository.integration.test.ts`
- `src/features/inquiries/infrastructure/http/customer-conversation-request-handler.ts`
- `src/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-message-repository.ts`
- `src/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-repository.ts`
- `src/features/inquiries/presentation/__tests__/customer-message-client.test.ts`
- `src/features/inquiries/presentation/clients/customer-conversation-stream-client.ts`
- `src/features/inquiries/presentation/clients/customer-message-client.ts`
- `src/features/inquiries/presentation/clients/staff-conversation-reply-client.ts`
- `src/features/inquiries/presentation/components/staff/staff-conversation-message-list.tsx`
- `src/features/inquiries/presentation/components/staff/staff-inquiry-detail.tsx`
- `src/features/inquiries/presentation/components/staff/staff-reply-composer.tsx`
- `src/features/inquiries/presentation/state/__tests__/customer-chat-reducer.test.ts`
- `src/features/inquiries/presentation/state/__tests__/staff-reply-reducer.test.ts`
- `src/features/inquiries/presentation/state/customer-chat-reducer.ts`
- `src/features/inquiries/presentation/state/staff-reply-reducer.ts`
- `src/features/inquiries/presentation/view-models/customer-chat-view-model.ts`
- `src/i18n/messages/ar.json`
- `src/i18n/messages/en.json`
- `src/i18n/messages/fa.json`
- `src/i18n/messages/tr.json`

### Added feature files

- `docs/tasks/0035-conversation-translation.md`
- `drizzle/0018_conversation_translation.sql`
- `drizzle/meta/0018_snapshot.json`
- `src/app/api/staff/inquiries/[inquiryId]/messages/[messageId]/translation/route.ts`
- `src/composition/conversation-translation/conversation-translation-worker.ts`
- `src/composition/conversation-translation/translation-remediation-http.ts`
- `src/features/conversation-translation/application/__tests__/customer-delivery.test.ts`
- `src/features/conversation-translation/application/__tests__/process-translation-jobs.test.ts`
- `src/features/conversation-translation/application/ports/translation-ports.ts`
- `src/features/conversation-translation/application/ports/translation-remediation-repository.ts`
- `src/features/conversation-translation/application/use-cases/process-translation-jobs.ts`
- `src/features/conversation-translation/application/use-cases/project-customer-messages.ts`
- `src/features/conversation-translation/application/use-cases/remediate-translation.ts`
- `src/features/conversation-translation/domain/__tests__/translation.test.ts`
- `src/features/conversation-translation/domain/types/translation-remediation.ts`
- `src/features/conversation-translation/domain/types/translation.ts`
- `src/features/conversation-translation/infrastructure/__tests__/customer-website-locale.test.ts`
- `src/features/conversation-translation/infrastructure/__tests__/postgres-translation.integration.test.ts`
- `src/features/conversation-translation/infrastructure/__tests__/translation-remediation-http.test.ts`
- `src/features/conversation-translation/infrastructure/http/customer-website-locale.ts`
- `src/features/conversation-translation/infrastructure/http/translation-remediation-request-handler.ts`
- `src/features/conversation-translation/infrastructure/persistence/postgres-customer-message-reader.ts`
- `src/features/conversation-translation/infrastructure/persistence/postgres-translation-job-repository.ts`
- `src/features/conversation-translation/infrastructure/persistence/postgres-translation-remediation-repository.ts`
- `src/features/conversation-translation/infrastructure/persistence/read-message-translations.ts`
- `src/features/conversation-translation/infrastructure/persistence/schedule-message-translation.ts`
- `src/features/conversation-translation/infrastructure/persistence/translation-schema.ts`
- `src/features/conversation-translation/presentation/__tests__/message-translation.test.tsx`
- `src/features/conversation-translation/presentation/clients/parse-message-translation.ts`
- `src/features/conversation-translation/presentation/components/message-translation.tsx`
- `src/features/conversation-translation/presentation/components/translation-remediation-actions.tsx`
- `src/features/conversation-translation/testing/fakes/translation-fakes.ts`
- `src/shared/config/conversation-translation.ts`
- `tooling/workers/conversation-translation-dev.ts`
- `tooling/workers/conversation-translation-runtime.ts`
- `tooling/workers/conversation-translation.test.ts`
- `tooling/workers/conversation-translation.ts`
