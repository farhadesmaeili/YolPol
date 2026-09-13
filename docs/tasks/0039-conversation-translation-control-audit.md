# Independent Conversation Translation Control audit

Audit date: 2026-09-07. Repository: `E:\farhad-projects\yolpol`.
Branch verified: `feature/conversation-translation-control`. HEAD: `c88c173`.
The implementation was already uncommitted at audit start. Findings below come from the actual tracked diff, untracked implementation, existing consumers, and executed checks.

1. **Verdict: PASS WITH FIXES**

2. **Blockers found:** Two UI defects were found and resolved. No remaining blocking safety, scheduling, concurrency, authorization, persistence, or architecture defect was identified.

3. **Fixes made:**

   - Older messages created under MANUAL/ON_DEMAND lost their Translate action when the current policy returned to AUTO. Mode changes intentionally do not backfill jobs. `staff-conversation-message-list.tsx` now offers REQUEST for an eligible message with no translation regardless of the current automation mode. Three sender-specific rendering regressions failed before this fix and passed afterward.
   - `translation-control-panel.tsx` copied its initial server snapshot into local state and never reconciled refreshed props. Next.js refresh preserves client state, so another Staff member's update could leave stale pressed modes and versions. The panel now renders the server snapshot directly and refreshes after a successful mutation.
   - Documented both semantics in the feature task document. No migration or production persistence code was changed by this audit.

4. **Control/default model:** Absence of a row produces AUTO/AUTO/AUTO and effective version 0 without inserting on read. The Conversation primary key prevents duplicate controls. A change locks the Conversation before checking the control version, including first writes. A no-op at the current version returns unchanged without an event; a stale retry returns conflict. A real change increments the version once and writes its complete before/after audit in the same transaction. Integration coverage checks competing independent field updates, one winning row/event, stale retries, current-version no-ops, and rollback when event insertion fails.

5. **Customer to Staff:** AUTO schedules only a required Staff-working-locale translation; MANUAL schedules none. The authored Customer body remains available to Staff. Initial inquiry messages and subsequent appends use the shared scheduler. A missing control row retains automatic behavior.

6. **Staff to Customer safety:** AUTO/MANUAL selects when to schedule, never which body is safe. Known cross-language Staff messages require a successful translation to their stored authoritative Customer target. Missing, PENDING, RUNNING, FAILED, and CANCELLED translations cannot fall back to Staff source. SKIPPED messages remain hidden and release later safe positions. Unknown-language originals remain hidden gaps. Same-language originals remain eligible. Source and target are retained separately from immutable authored bodies.

7. **AI to Staff / token savings:** AI scheduling is separate from Staff-to-Customer policy. ON_DEMAND suppresses Staff convenience jobs. Tests persist three AI messages, repeatedly generate Staff and Customer read models, and run the actual translation worker with a fake Gateway: zero jobs and zero Gateway executions before REQUEST; one job and one execution after concurrent requests; no second execution after completion/repeated request. Another integration test finalizes three actual AI routing turns under ON_DEMAND and verifies zero translation jobs and matching authoritative Customer/source locales. An AI message requiring Customer translation still retains that safety translation independently of the Staff convenience policy; normal finalization authors in the Customer locale.

8. **Manual Translate:** REQUEST accepts exactly `action` and `expectedVersion`; route identities are separately validated. The repository locks the Conversation, verifies message membership, and derives Staff locale for Customer/AI or stored Customer target for Staff. Unknown source, SYSTEM, same-language, and skipped cases cannot create a REQUEST job. Existing matched job/translation pairs return unchanged, including stale repeated REQUEST versions; explicit RETRY remains required for failures. This makes timeout retries, two Staff requests, and concurrent AUTO append/REQUEST converge on one intent.

9. **Source-language confirmation:** Only eligible unknown outbound source language can be confirmed. Customer rows cannot be used to overwrite the authoritative Customer locale. Supported locales are validated at the action boundary and constrained in SQL. The existing stored target is preserved, with historical target fallback derived server-side. MANUAL records language without a job; AUTO uses the shared directional policy. The MANUAL regression verifies Persian source, Turkish target, zero jobs, and empty Customer history before explicit translation.

10. **Concurrency/races:** Control changes, both message append APIs, AI finalization, and remediation serialize on the same Conversation row. Inquiry creation owns its newly inserted Conversation transaction. A worker uses job/translation locks and lease fencing; it does not need the control lock because mode changes preserve existing work. Tests cover a first-write version-zero race, stale independent-field updates, concurrent requests, append/REQUEST races for all senders, Customer/Staff/AI append-versus-mode races, and actual PostgreSQL lock contention proving all three append types wait for and observe a committed manual policy. Existing queued work can be claimed after a mode change, complete after another change, and remain reusable. Returning to AUTO affects future scheduling without backfill.

11. **Translation identity:** `(message_id, target_locale)` remains sufficient. Sender identity is fixed per message, targets derive from server semantics, and all intents request a faithful translation of the same immutable body. If Customer safety and Staff convenience happen to share the same target for an AI message, their required translated content is identical. SQL unique indexes plus transactional scheduling and Conversation locking prevent duplicate jobs. No new purpose key is warranted. Existing execution IDs, lease tokens, bounded recovery, and explicit failure retries remain unchanged.

12. **Website safety:** Customer history and SSE composition both use `PostgresCustomerMessageReader` and `projectCustomerMessages`. Translation joins constrain both message ID and the stored Customer target, so another message's translation or a different target does not satisfy the query. The barrier is evaluated before applying a supplied cursor. No automation policy was added to these predicates. Manual integration assertions verify empty SSE before Staff translation and the stored safe Turkish body afterward; existing status, unknown-gap, skip, cursor, and same-language regressions also pass.

13. **Channel Foundation safety:** Production channel predicates were not copied or modified. Schedule, claim, and pre-dispatch lease checks independently enforce the safe body and earlier safe-prefix barrier. Cross-language bodies come from the successful Customer-target translation; original text is selected only for same-language messages. The MANUAL integration test withholds scheduling and sends only the completed safe body through a fake adapter. Existing claim-state and post-claim barrier tests pass. Channel policy is generic; this does not constitute live Telegram/Instagram/Email/WhatsApp validation.

14. **AI Agent compatibility:** Actual finalization uses the common scheduler while holding the Conversation lock and passes the authoritative trigger locale. Translation controls do not modify AI routing controls or global eligibility. Existing HUMAN_TAKEOVER, PAUSED, Staff precedence, supersession, lease, and escalation tests pass. No Agent execution, grounding, tool, or fallback policy implementation was changed.

15. **UI truthfulness:** No translation row means an explicit Translate action for eligible authorized Staff, not a fabricated Translating state. PENDING/RUNNING, success, failure, cancellation, skip, and source-confirmation states use persisted metadata. Staff cross-language delivery displays its blocked state. AI customer-language wording is separate from Staff convenience translation actions. All four locale catalogs contain the new keys and pass rendering coverage; affected controls use gap/symmetric or logical spacing, language direction, pressed states, labels, and disabled authorization states. The panel refresh defect was fixed by removing its duplicate mode state. This audit did not perform a browser interaction or device visual test.

16. **HTTP/auth:** PUT control and POST remediation require strict Origin and a valid Staff session. Application authorization uses the existing reply capability: SUPER_ADMIN/ADMIN/SALES may mutate; VIEWER may read only. Customer credentials do not establish a Staff session. Mode payloads have an exact four-field allow-list and nonnegative safe-integer expected version; REQUEST uses a positive message-language version and its own two-field allow-list. Queries, extra actor/provider/locale/body fields, invalid modes/locales, and oversized bodies are rejected. Actors derive from the validated server principal. Errors are bounded status codes without raw persistence/provider exceptions. Existing RETRY may select only an already persisted failed/cancelled target; CONFIRM_LANGUAGE intentionally accepts a validated source assertion, not a Customer-target override.

17. **Migration 0021:** Correctly follows 0020 and adds two metadata tables without backfilling default controls or modifying authored content. It extends the remediation action constraint with REQUEST while preserving all existing actions. Mode combinations, positive persisted versions, event version increments, changed values, and Staff actor references have checks. The append-only trigger rejects direct UPDATE/DELETE while the Conversation exists and permits retention cascades after its deletion; integration tests exercise these paths and cleanup succeeds. TRUNCATE remains the established integration maintenance path. Snapshot predecessor and journal order match; expanded tests compare all new checks against Drizzle/SQL and ensure unrelated snapshot tables are unchanged. Migration was exercised only on disposable PostgreSQL, never Development.

18. **Existing-test modifications:** Reviewed all changed test diffs. AI routing, Telegram delivery, Inquiry, translation, and channel cleanup add the two new tables. Inquiry expected table inventory grows by two and migration count changes from 21 to 22. Channel migration 0020 is now located by its index rather than required to remain the last entry. The historical 0018 test still reapplies real 0018, then restores the current REQUEST action constraint. Prior safety assertions were retained. Added manual channel/Website, UI, policy, and remediation assertions extend coverage; none replaces a failing safety assertion with a weaker expectation. The original nondeterministic append race assertion is supplemented by an observed PostgreSQL lock test.

19. **Security/privacy and architecture:** Reviewed requested keyword hits in modified/new code, DTOs, SQL, clients, and tests. No new internal price, supplier cost, margin, credential, secret, or raw provider payload path was found. Control/event DTOs contain only policy and audit metadata; bodies remain in the existing message/translation model. SQL uses bound parameters; React renders body text without HTML injection; URLs are fixed routes with encoded identities. Domain/application remain framework independent, repositories implement application ports, presentation consumes application/domain contracts, and thin App Router endpoints use explicit server-only composition. The feature retains its existing five layers and testing support. No dependency changes were made.

20. **Tests added/updated by this audit:**

   - `staff-reply-composer.test.tsx`: three observable regressions for unscheduled Customer/Staff/AI messages after returning to AUTO; blocked Staff state and AI customer-language wording remain visible.
   - `postgres-translation.integration.test.ts`: first-write conflict/event atomicity/retention; five invalid SQL cases; repeated reads and fake-Gateway execution counts; three AUTO/REQUEST races; Customer addition to append/mode race; three actual lock-contention cases; manual SSE release and confirmed-source safety assertions.
   - AI routing integration: three real finalized turns under ON_DEMAND with no translation jobs.
   - Migration test: Drizzle/SQL/snapshot check parity and preservation of unrelated tables.

21. **Exact validation results:**

| Command | Result |
| --- | --- |
| `pnpm exec vitest run src/features/inquiries/presentation/__tests__/staff-reply-composer.test.tsx` before production fix | Expected regression: 3 failed, 6 passed |
| `pnpm exec vitest run src/features/conversation-translation src/features/inquiries/presentation/__tests__/staff-reply-composer.test.tsx` | PASS: 12 files, 71 tests |
| `pnpm lint` | PASS, exit 0 |
| `pnpm typecheck` | PASS, exit 0; repeated successfully after final integration-test edits |
| `pnpm test` | PASS: 191 files, 2,018 tests |
| `pnpm test:integration` | Initial sandbox attempt could not access Docker. Authorized disposable run: 174 passed, 1 new fixture failed because its ID lacked the required `ai_job_` prefix. Corrected fixture, final run PASS: 12 files, 175 tests, 57.17 seconds; disposable container removed |
| `pnpm db:check` | Sandbox attempt failed with `uv_os_get_passwd` ENOMEM; authorized read-only rerun PASS, exit 0 |
| `pnpm build` | PASS, exit 0; 109 static pages generated |
| `pnpm exec eslint src/features/conversation-translation/infrastructure/__tests__/postgres-translation.integration.test.ts src/features/conversation-ai-routing/infrastructure/__tests__/postgres-conversation-ai-routing-repository.integration.test.ts` | PASS on final test edits, exit 0 |

22. **Remaining non-blocking risks/limits:** No real provider calls or linguistic-quality evaluation; zero-call assertions use the real durable worker with a fake Gateway. No browser/device interaction or visual RTL/LTR check was performed. Cross-session controls become current on server refresh; policy changes are not broadcast as a new realtime event. A control mutation retried with a stale version safely conflicts rather than replaying a previous HTTP success. Deployment still requires separately authorized migration 0021; no Development database was migrated or mutated. Integration safety predicates were tested with fake channel adapters, not live future channel integrations. No staging, commit, push, branch switch, or volume deletion was performed.

The following inventory includes the pre-existing uncommitted implementation and this audit's narrowly scoped fixes/tests/report. `git diff --stat` describes tracked changes only; untracked files are listed separately.

23. **Exact changed/untracked file inventory:**

Tracked modified: 26; untracked files: 25; staged files: 0.

Tracked modified files:

```text
drizzle/meta/_journal.json
src/app/[locale]/staff/(protected)/inquiries/[inquiryId]/page.tsx
src/features/conversation-ai-routing/infrastructure/__tests__/postgres-conversation-ai-routing-repository.integration.test.ts
src/features/conversation-channels/infrastructure/__tests__/conversation-channel-migration.test.ts
src/features/conversation-channels/infrastructure/__tests__/postgres-conversation-channel-repository.integration.test.ts
src/features/conversation-translation/application/ports/translation-remediation-repository.ts
src/features/conversation-translation/domain/types/translation-remediation.ts
src/features/conversation-translation/infrastructure/__tests__/postgres-translation.integration.test.ts
src/features/conversation-translation/infrastructure/__tests__/translation-remediation-http.test.ts
src/features/conversation-translation/infrastructure/http/translation-remediation-request-handler.ts
src/features/conversation-translation/infrastructure/persistence/postgres-translation-remediation-repository.ts
src/features/conversation-translation/infrastructure/persistence/schedule-message-translation.ts
src/features/conversation-translation/infrastructure/persistence/translation-schema.ts
src/features/conversation-translation/presentation/__tests__/message-translation.test.tsx
src/features/conversation-translation/presentation/components/message-translation.tsx
src/features/conversation-translation/presentation/components/translation-remediation-actions.tsx
src/features/inquiries/infrastructure/__tests__/postgres-inquiry-repository.integration.test.ts
src/features/inquiries/infrastructure/__tests__/postgres-telegram-delivery-repository.integration.test.ts
src/features/inquiries/presentation/__tests__/staff-reply-composer.test.tsx
src/features/inquiries/presentation/components/staff/staff-conversation-message-list.tsx
src/features/inquiries/presentation/components/staff/staff-inquiry-detail.tsx
src/features/inquiries/presentation/components/staff/staff-reply-composer.tsx
src/i18n/messages/ar.json
src/i18n/messages/en.json
src/i18n/messages/fa.json
src/i18n/messages/tr.json
```

Untracked files (`git ls-files --others --exclude-standard`):

```text
docs/tasks/0039-conversation-translation-control-audit.md
docs/tasks/0039-conversation-translation-control.md
drizzle/0021_conversation_translation_control.sql
drizzle/meta/0021_snapshot.json
src/app/api/staff/inquiries/[inquiryId]/translation-control/route.ts
src/composition/conversation-translation/conversation-translation-control.ts
src/composition/conversation-translation/translation-control-http.ts
src/features/conversation-translation/application/__tests__/translation-control.test.ts
src/features/conversation-translation/application/dto/translation-control-dto.ts
src/features/conversation-translation/application/ports/translation-control-ports.ts
src/features/conversation-translation/application/use-cases/change-conversation-translation-control.ts
src/features/conversation-translation/application/use-cases/get-conversation-translation-control.ts
src/features/conversation-translation/domain/__tests__/translation-control.test.ts
src/features/conversation-translation/domain/entities/conversation-translation-control.ts
src/features/conversation-translation/domain/errors/translation-control-errors.ts
src/features/conversation-translation/domain/services/translation-scheduling-policy.ts
src/features/conversation-translation/domain/types/translation-control.ts
src/features/conversation-translation/infrastructure/__tests__/translation-control-http.test.ts
src/features/conversation-translation/infrastructure/__tests__/translation-control-migration.test.ts
src/features/conversation-translation/infrastructure/http/translation-control-request-handler.ts
src/features/conversation-translation/infrastructure/persistence/postgres-translation-control-repository.ts
src/features/conversation-translation/infrastructure/validation/translation-control-payload.ts
src/features/conversation-translation/presentation/__tests__/translation-control-panel.test.tsx
src/features/conversation-translation/presentation/clients/translation-control-client.ts
src/features/conversation-translation/presentation/components/translation-control-panel.tsx
```

24. **`git diff --check`:** PASS, exit 0; no output.

25. **`git status --short`:**

```text
 M drizzle/meta/_journal.json
 M src/app/[locale]/staff/(protected)/inquiries/[inquiryId]/page.tsx
 M src/features/conversation-ai-routing/infrastructure/__tests__/postgres-conversation-ai-routing-repository.integration.test.ts
 M src/features/conversation-channels/infrastructure/__tests__/conversation-channel-migration.test.ts
 M src/features/conversation-channels/infrastructure/__tests__/postgres-conversation-channel-repository.integration.test.ts
 M src/features/conversation-translation/application/ports/translation-remediation-repository.ts
 M src/features/conversation-translation/domain/types/translation-remediation.ts
 M src/features/conversation-translation/infrastructure/__tests__/postgres-translation.integration.test.ts
 M src/features/conversation-translation/infrastructure/__tests__/translation-remediation-http.test.ts
 M src/features/conversation-translation/infrastructure/http/translation-remediation-request-handler.ts
 M src/features/conversation-translation/infrastructure/persistence/postgres-translation-remediation-repository.ts
 M src/features/conversation-translation/infrastructure/persistence/schedule-message-translation.ts
 M src/features/conversation-translation/infrastructure/persistence/translation-schema.ts
 M src/features/conversation-translation/presentation/__tests__/message-translation.test.tsx
 M src/features/conversation-translation/presentation/components/message-translation.tsx
 M src/features/conversation-translation/presentation/components/translation-remediation-actions.tsx
 M src/features/inquiries/infrastructure/__tests__/postgres-inquiry-repository.integration.test.ts
 M src/features/inquiries/infrastructure/__tests__/postgres-telegram-delivery-repository.integration.test.ts
 M src/features/inquiries/presentation/__tests__/staff-reply-composer.test.tsx
 M src/features/inquiries/presentation/components/staff/staff-conversation-message-list.tsx
 M src/features/inquiries/presentation/components/staff/staff-inquiry-detail.tsx
 M src/features/inquiries/presentation/components/staff/staff-reply-composer.tsx
 M src/i18n/messages/ar.json
 M src/i18n/messages/en.json
 M src/i18n/messages/fa.json
 M src/i18n/messages/tr.json
?? docs/tasks/0039-conversation-translation-control-audit.md
?? docs/tasks/0039-conversation-translation-control.md
?? drizzle/0021_conversation_translation_control.sql
?? drizzle/meta/0021_snapshot.json
?? src/app/api/staff/inquiries/[inquiryId]/translation-control/
?? src/composition/conversation-translation/conversation-translation-control.ts
?? src/composition/conversation-translation/translation-control-http.ts
?? src/features/conversation-translation/application/__tests__/translation-control.test.ts
?? src/features/conversation-translation/application/dto/
?? src/features/conversation-translation/application/ports/translation-control-ports.ts
?? src/features/conversation-translation/application/use-cases/change-conversation-translation-control.ts
?? src/features/conversation-translation/application/use-cases/get-conversation-translation-control.ts
?? src/features/conversation-translation/domain/__tests__/translation-control.test.ts
?? src/features/conversation-translation/domain/entities/
?? src/features/conversation-translation/domain/errors/
?? src/features/conversation-translation/domain/services/
?? src/features/conversation-translation/domain/types/translation-control.ts
?? src/features/conversation-translation/infrastructure/__tests__/translation-control-http.test.ts
?? src/features/conversation-translation/infrastructure/__tests__/translation-control-migration.test.ts
?? src/features/conversation-translation/infrastructure/http/translation-control-request-handler.ts
?? src/features/conversation-translation/infrastructure/persistence/postgres-translation-control-repository.ts
?? src/features/conversation-translation/infrastructure/validation/
?? src/features/conversation-translation/presentation/__tests__/translation-control-panel.test.tsx
?? src/features/conversation-translation/presentation/clients/translation-control-client.ts
?? src/features/conversation-translation/presentation/components/translation-control-panel.tsx
```

26. **`git diff --stat`:**

```text
 drizzle/meta/_journal.json                         |   7 +
 .../(protected)/inquiries/[inquiryId]/page.tsx     |   8 +-
 ...ation-ai-routing-repository.integration.test.ts |  24 +-
 .../conversation-channel-migration.test.ts         |   2 +-
 ...ersation-channel-repository.integration.test.ts |  35 +++
 .../ports/translation-remediation-repository.ts    |   2 +-
 .../domain/types/translation-remediation.ts        |   2 +
 .../postgres-translation.integration.test.ts       | 281 ++++++++++++++++++++-
 .../__tests__/translation-remediation-http.test.ts |   4 +-
 .../translation-remediation-request-handler.ts     |   2 +-
 .../postgres-translation-remediation-repository.ts |  66 ++++-
 .../persistence/schedule-message-translation.ts    |  35 ++-
 .../persistence/translation-schema.ts              |  44 +++-
 .../__tests__/message-translation.test.tsx         |  13 +
 .../components/message-translation.tsx             |  11 +-
 .../components/translation-remediation-actions.tsx |   6 +-
 ...postgres-inquiry-repository.integration.test.ts |   8 +-
 ...elegram-delivery-repository.integration.test.ts |   2 +-
 .../__tests__/staff-reply-composer.test.tsx        |  22 +-
 .../staff/staff-conversation-message-list.tsx      |  26 +-
 .../components/staff/staff-inquiry-detail.tsx      |  35 ++-
 .../components/staff/staff-reply-composer.tsx      |   7 +-
 src/i18n/messages/ar.json                          |  22 +-
 src/i18n/messages/en.json                          |  22 +-
 src/i18n/messages/fa.json                          |  22 +-
 src/i18n/messages/tr.json                          |  22 +-
 26 files changed, 688 insertions(+), 42 deletions(-)
```

Git emitted an environmental warning that the user global ignore file could not be accessed. Explicit tracked and untracked inventories above were inspected; no staged changes exist.
