# Task 0082: Customer Acquisition Automation Foundation

## Subsequent repository status — Task 0083 preflight

PR #168 merged into develop at `7731cf1b38f851a044be0e90e825379afbd0c959`.
The Task 0083 preflight verified that commit, a clean worktree/index and the protected
Conversation AI stash. Statements below about unstaged/uncommitted work describe
Task 0082's historical implementation/review checkpoints, not its current merge state.

Latest historical Task 0082 evidence is 70 acquisition tests, 22 PostgreSQL integration
tests and 2,595 full-suite tests. Earlier verification tables remain historical evidence.
Task 0083's own executed checks are recorded in its separate task document.

## Historical starting state and scope

Implementation began on `feature/customer-acquisition-automation-foundation` at
`46822c96ce983bf7d19067224e8f1181c4c97917`, with a clean worktree and the protected
Conversation AI experiment stash present. Repository changes only are authorized.
All work remains unstaged and uncommitted. Existing Docker volumes, application
runtimes, provider credentials, Staging, Production, and VPS state are out of scope.

## NOW

Implemented an isolated, synthetic-only local acquisition subsystem: a private
authenticated API, independent business PostgreSQL persistence and migrations,
company/contact identity, immutable provenance, deterministic qualification,
suppression, and an inactive n8n demonstration workflow. n8n owns orchestration;
YOLPOL application code owns all acquisition business rules. The main application
database and migration history remain separate.

The local foundation is implemented and disposable runtime verification passed.
This is repository/local test evidence, not persistent-stack or Production activation.

## Resume and implementation evidence

The continuation rechecked the same branch/HEAD/protected stash, no staged files,
and only Task 0082 work in progress. Existing valid implementation was retained.
The feature has domain, application, infrastructure, presentation and testing layers;
composition builds a dedicated Node HTTP process rather than public App Router routes.
No dependency or lockfile change was needed.

The nine independent tables cover companies, normalized domains, unverified contacts,
company/segment leads, immutable source observations, versioned assessments, suppression,
source-scoped stable identities and a global idempotency-result ledger. Domain/email/
source/segment uniqueness, foreign keys, score bounds and active-suppression uniqueness
are PostgreSQL-enforced. A transaction advisory lock serializes this small synthetic
pilot's multi-identity decisions. Name/country similarities and conflicting identities
produce review outcomes, never automatic merges or overwrites.

The runtime role cannot own/create tables, read the migration ledger, update provenance
or assessments, or delete business rows. Only lead state and one-way suppression release
have column-scoped update privileges. The separate migrator owns acquisition objects.
n8n manages its own schema using its own non-superuser role in another PostgreSQL
container; it receives no acquisition or main-application database credentials.

API authentication is an independent random, file-backed opaque token. Nested input
allow-lists reject unknown/pricing fields and ordinary real company/email domains.
The only accepted domains are reserved synthetic namespaces. Bounded HTTP bodies,
headers, deadlines, connection counts, database queries and process-local rate limits
limit resource use. Responses and application logs do not include business payloads.
Free-text names remain an operator responsibility: a synthetic-domain gate cannot
prove the real-world origin of every string supplied by an authorized caller.

## Runtime corrections verified during continuation

- PostgreSQL `trim()` did not strip secret-file line endings, causing SQLSTATE 28P01.
  The independent initializers now use explicit whitespace trimming. An intermediate
  SQL-parenthesis typo was corrected; fresh initialization and migrations then passed.
- n8n's editor asset generation requires a writable `/home/node/.cache`. A bounded
  owner-only tmpfs fixes the observed startup failure without disabling read-only
  root, dropped capabilities or no-new-privileges.
- n8n 2.42.4 CLI `execute` does not initialize the file credential overrides used by
  the normal server. Verification now invokes the authenticated manual-run server
  API with an ephemeral synthetic owner and verifies committed acquisition data.
  The workflow remains inactive; no secret persistence or embedded header workaround
  was introduced. Import/export uses the supported n8n CLI.
- HTTP request construction is inside the error boundary and rejects unsupported
  methods/absolute request targets without crashing the process. A transport test
  verifies the next valid request succeeds.
- Canonical source URLs are length-checked after Unicode percent encoding. Migrator
  connections are closed even on failures, releasing session locks deterministically.
- The disposable harness validates the resolved model and actual container/network
  state, uses only tmpfs databases, and checks the resolved private temporary path
  before removing its generated secret directory.

## Executed validation (before focused audit corrections)

| Check | Result |
| --- | --- |
| `pnpm test:acquisition` | 47 tests passed in 6 files |
| `pnpm db:acquisition:check` | Passed; offline independent metadata check |
| `pnpm test:acquisition:runtime` | Passed; fresh migration, 12 real PostgreSQL tests, API/n8n readiness, import/export, inactive state, authenticated server/manual execution and committed operation |
| Actual Docker inspection | Three internal project-only networks; no validation host ports or named volumes; API/n8n UID 1000, read-only root, dropped capabilities, no-new-privileges |
| Runtime negative checks | Unauthenticated API request returns 401; n8n cannot connect directly to acquisition PostgreSQL |
| `pnpm lint` / `pnpm typecheck` | Passed |
| `pnpm test` (default parallelism, before the final disposable-guard test was added) | 2,570 passed; 1 unchanged deployment-hardening timeout; 256 files passed / 1 failed |
| `pnpm test --maxWorkers=2` (final tree) | 2,572 tests passed in 257 files; existing timeouts retained |
| `pnpm build` | Passed; 81 static pages; no new Next.js route |
| `git diff --check` | Passed |

Main migration identity remains `0024_phase_c2_live_acceptance`, SHA-256
`606a82f9999d2cc7efbd572dbaac1fdd35e417c6ae5ac61ae8dd876bb62540d4`.
The main Dockerfile, application Compose variants, Drizzle config/history and
deployment/bootstrap/release control-plane contracts are unchanged.

## Failure classification and verification limits

- A — Task 0082 defects: secret newline handling, its intermediate SQL correction,
  and n8n writable-cache compatibility were fixed and passed fresh disposable checks.
  The API transport issue was fixed with a passing regression test.
- B — Unchanged repository timing failure: the default parallel full suite exceeded
  the existing deployment-hardening test's 30-second deadline. No test or timeout was
  weakened. Its focused rerun passed, and the complete two-worker suite passed.
- C — Windows sandbox/access: prior tsx `uv_os_get_passwd` ENOMEM, Task Scheduler
  validate-only access and Docker access limitations were retried unchanged with
  approved access. All 20 tests in the three affected files passed. No scheduled
  task was registered and no unrelated test was edited.
- D — External/runtime: an initial package download timed out; the unchanged build
  retry succeeded. The CLI credential-overwrite difference is documented above;
  the normal server/manual path passed instead.

The pinned n8n release/digest were rechecked against official release/registry
metadata. Upstream warnings about trimmed file values and an unavailable MCP registry
node were observed; the allow-list was not expanded. Unsupported legacy personalization/
version-notification flags remain omitted, rather than asserted as effective.

No persistent local startup, browser/editor usability check, external egress probe,
real provider, real company/contact, email, Telegram, AI, Staging or Production test
was performed. The normal `127.0.0.1:5678` mapping is Compose-validated; the disposable
variant deliberately publishes no ports. Runtime proof covers the manual workflow's
authenticated API/persistence boundary, not a browser rendering of the final node.
Container images/build cache remain local; each completed harness removed only its
own containers/networks and newly generated temporary secret directory, with no
Docker volume deletion. Persistent ACLs, backup/restore, retention, multi-user editor
policy and operational sizing remain future work.

See [ADR 0004](../adr/0004-customer-acquisition-automation-boundary.md) and the
[subsystem runbook](../../deploy/customer-acquisition/README.md) for API contracts,
normalization/fingerprint rules, scoring, suppression, verified n8n sources and setup.

## Focused audit corrections (2026-10-09)

ACQ-01 — FIXED AND VERIFIED: retain the existing raw UTF-16 code-unit cap, then
trim/NFC-normalize and validate the final length again. Independently bound the
lowercase company key at the parser boundary and before repository transaction work.
This is deliberately conservative relative to PostgreSQL character counts: a
supplementary character consumes two JavaScript code units but one PostgreSQL
character. The shared bounded-text check covers company/contact names and original
email text; existing final IDNA/email/serialized-URL bounds and ASCII identifier
patterns remain intact. No column expansion, truncation or migration change was
needed. Overlong final names/keys now return safe HTTP 400 INVALID_REQUEST without
calling persistence. Valid canonical fingerprints, replay and deduplication persist.

ACQ-02 — FIXED AND VERIFIED: both subsystem PostgreSQL services now use
`log_error_verbosity=terse`, retaining statement/parameter protections and observable
operational errors. The guarded disposable harness introspects both databases'
effective settings (including statement/duration/sample logging), then deliberately
triggers duplicate email/domain violations with a fresh UUID-derived synthetic
sentinel. Captured container logs contain the safe constraint errors but no sentinel,
DETAIL, CONTEXT or STATEMENT lines. Acquisition uses the real business tables; a
real duplicate-email error passed through the API handler returns only the expected
503 UNAVAILABLE DTO and bounded log fields. The n8n database probe uses a
connection-local temporary table, not n8n's persistent schema.

| Correction verification | Result |
| --- | --- |
| Test-first targeted regressions | Initially reproduced both findings; final targeted run: 10 passed |
| `pnpm test:acquisition` | 56 tests passed in 6 files |
| `pnpm db:acquisition:check` | Passed; unchanged independent migration metadata |
| `pnpm test:acquisition:runtime` | Passed; 14 PostgreSQL tests, both database logging probes, API/n8n readiness, authenticated inactive manual workflow and committed operation |
| `pnpm test:acquisition:disposable` after cleanup-finally adjustment | Passed; 14 PostgreSQL tests, both logging probes and positively inspected project-only cleanup |
| `pnpm lint` / `pnpm typecheck` | Passed on the final code |
| `pnpm test --maxWorkers=2` | 2,581 tests passed in 257 files with approved host access |
| `pnpm build` | Passed; 81 static pages |
| `git diff --check` | Passed |

The first sandbox full-suite attempt had 2,579 passes and the unchanged Task
Scheduler GetFolder/tsx user-info access failures. The unchanged approved-access
rerun passed; no test or timeout was weakened. The metadata check likewise required
an unchanged access retry after `uv_os_get_passwd` ENOMEM. Docker validation required
approved access, not a relaxation of its isolation contract.

Disposable project IDs were `yolpol-acq-test-21e358e7f3024c8e91c8d52721120e52`
(runtime) and `yolpol-acq-test-bbb51a64834a4db48c910f063d600775` (final cleanup
verification). Read-only inspection confirmed no containers/networks remained from
either run or the earlier sandbox-blocked attempt. Temporary generated credentials
were removed; no existing Docker volume was deleted. Cleanup now verifies actual
project ownership and uses a filesystem finally block even if Docker cleanup fails.

Limits: terse verbosity removes error detail, not arbitrary values in every possible
SQL primary error message. SQL remains parameterized and arbitrary SQL is not exposed.
No persistent deployment, real data, provider integration, credential rotation or
Production activation was performed. The earlier historical verification table is
retained above; these are the subsequent correction results.

## Final ACQ-01 repository-boundary correction (2026-10-09)

The subsequent independent review found the earlier ACQ-01 verification incomplete:
HTTP validation rejected expanded contact names, but direct repository ingestion
validated only the company name/key. Contact names could reach a transaction without
the shared trim/NFC and final-length checks. The remaining P2 finding was reproduced
before changing production code: six invalid contact-name unit cases reached the
transaction sentinel instead of throwing `AcquisitionValidationError`.

ACQ-01 — FIXED AND VERIFIED: repository ingestion now creates a canonical contact
copy using the existing domain `boundedText(name, 160)` before fingerprint generation
or transaction entry. The same copy supplies the version-1 fingerprint, equality/
conflict comparisons and contact insert. Raw and final UTF-16 limits remain unchanged;
no truncation, fingerprint-algorithm change, caller mutation or migration is involved.
Absent contacts remain null; a present contact still requires a valid name.

Fourteen new boundary tests cover U+0344 expansion, its pre-normalized equivalent,
mixed overflow, supplementary/ASCII bounds, blank names, valid names, null contacts
and unchanged company-key rejection. Invalid cases assert the transaction stub is
never invoked. Valid boundary tests use a deliberate transaction sentinel, not mocked
persistence success. Eight additional real PostgreSQL cases prove canonical contact
storage, direct-first and HTTP-parser-first replay, deduplication, immutable accepted
names, canonical operation/observation fingerprints, source provenance, null-contact
company targeting and absence of partial records after invalid input.

| Final boundary verification | Result |
| --- | --- |
| Test-first boundary regression | 6 failed / 8 passed before the fix; all 14 passed afterward |
| `pnpm test:acquisition` | 70 tests passed in 7 files |
| `pnpm test:acquisition:disposable` | 22 PostgreSQL tests passed; both unchanged database log-privacy probes passed |
| `pnpm lint` / `pnpm typecheck` | Passed |
| `pnpm test --maxWorkers=2` | 2,595 tests passed in 258 files with approved host access |
| `pnpm build` | Passed; 81 static pages |

The sandbox full-suite attempt passed 2,593 tests and encountered the same two
unrelated Task Scheduler GetFolder/tsx user-info access failures. The unchanged
approved-access rerun passed; no test or timeout was weakened. Disposable validation
also required approved Docker access. Its project was
`yolpol-acq-test-88e6998bc065455ebf8cbb741b3f85ee`; read-only inspection confirmed
zero remaining containers/networks for it and the sandbox-blocked project
`yolpol-acq-test-8f704bd8c73b4cdd9822c34d43c7c78b`. Only the guarded harness's own
tmpfs-backed resources and generated temporary credentials were cleaned up; no Docker
volume was deleted.

ACQ-02 — UNCHANGED, PREVIOUSLY VERIFIED: logging configuration, Compose topology,
credentials/hardening and privacy tooling were not modified. Its existing real-error
API and database-log checks passed again in the disposable run. The n8n manual runtime
workflow was not rerun for this contact-only correction; its earlier evidence remains
historical. No persistent environment, real data, provider or Production activation was
performed. Work remains unstaged and uncommitted for independent review.

## NEXT

Review one permitted discovery source and its terms, rate limits, retention and
privacy requirements. Design contact discovery, verification, provider-neutral AI
qualification and authenticated Telegram approval through existing YOLPOL owners.

## LATER

Sending, SMTP/IMAP, campaigns, follow-ups, reply classification, CRM, VPS integration
and Production activation require separate tasks. LinkedIn/broad scraping and shared
Production database access are not authorized by this foundation.

## Separate documentation item

The supplied operational context says Production v0.2.9 while existing deployment
documentation records v0.2.7. Task 0082 preserves those historical claims; authenticated
release-state reconciliation remains a separate task.
