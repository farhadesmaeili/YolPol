# Task 0083: Company Discovery Foundation — Phase A

The initial implementation report below is historical, before independent security
audit. Its privilege claims, all-green verification and file inventory are superseded
by the subsequent security-correction handoff at the end of this document.
The latest final-correction handoff below supersedes the earlier SEC-0083-04 blocker
under the user's explicitly approved authorization-time contract. This task is still
not approved for publication or activation.

## Historical authorized scope and starting state

Implementation starts from develop merge `7731cf1b38f851a044be0e90e825379afbd0c959`
(PR #168), on `feature/company-discovery-foundation`. The initial worktree and index
were clean. Protected stash `377b4d94ea9cc7a029eee3197165c23333401ee7` is preserved.
Local implementation and guarded disposable tests are authorized; commits, publication,
persistent activation, real data, external discovery and Phase B promotion are excluded.

## Design contract

Separate discovery types and operations within customer-acquisition accept synthetic
company batches only. Six additive acquisition tables retain candidates, evidence,
identity findings, reviews and separate idempotency results. Runtime source policies
approve no source. Positive policy injection exists only in tests. Authenticated intake
and reviewer credentials are independent from Task 0082; review attribution comes from
trusted file configuration. Canonical tables are never written by discovery.

## Implemented behavior

The five private routes implement batch intake/status, bounded reviewer queue,
evidence and review. Discovery credentials are separate from the existing token;
trusted protected-file bindings determine principal UUIDs/capabilities. Request data
cannot choose a reviewer. Missing credentials deny discovery; malformed bindings
fail startup. The normal registry is hardwired and approves no source. Fixture
approval exists only in testing; an esbuild dependency-graph test proves fixture code
is absent from the normal API bundle. No environment-based approval switch exists.

Company names, exact IDNA domains, source record IDs and provenance are bounded and
normalized. Batch inputs require reserved domains/URLs and `synthetic:true`; 1–20
candidates commit atomically. Candidate-to-candidate exact domain/source identities
produce immutable duplicate/conflict findings. Whitespace-normalized name/country
matches require review and never merge. Only weak findings can be resolved as distinct.
Strong conflicts cannot be approved; rejection, duplication or suppression records
their outcome without rewriting the finding or existing facts.

Reviewer evidence is append-only and typed: WEBSITE, SEGMENT, PACKAGING with
SUPPORTS/CONTRADICTS. Intake supplies immutable SOURCE evidence. Approval requires
support in all three review categories, no contradiction and no unresolved finding.
Candidate versions reject stale decisions. Rejection, suppression and duplicate
states cannot reopen; APPROVED can only move to SUPPRESSED. Approval has no commercial,
canonical-company or outreach meaning. No canonical table is written by discovery.

Deadlines are server-calculated, bounded by policy expiry and seven days. Repeated
strong identities inherit earlier deadlines; expired identities cannot be refreshed
by new batch keys. Reads expose expiry independently of stored decision history.
Suppression follows exact domain/source identity across batches and respects existing
Task 0082 domain suppression read-only. Releasing that suppression cannot revive
previously suppressed candidates. Logical expiry does not delete any records.

Idempotency uses the separate (principal, operation kind, key) namespace and a versioned
canonical fingerprint including policy metadata and candidate facts. Replay rechecks
authentication, policy validity, expiry and suppression; write results contain only
opaque receipt IDs. Current status separately exposes suppression and policy validity.

## Persistence, privileges and limits

`0001_company_discovery_foundation.sql` creates six acquisition tables. `0000` and its
snapshot are unchanged; Drizzle generated a new snapshot and appended journal entry.
The runtime role receives SELECT/INSERT and only candidate state/version UPDATE.
It receives no new canonical privileges, DELETE, TRUNCATE, DDL or migration access.
Checks/triggers enforce reserved domains, deadline bounds, batch completeness, SOURCE
evidence, terminal transitions, matching review/version, finding ownership, approval
evidence and unique approved strong identity decisions under the shared advisory lock.

The service shares Task 0082's private Node transport: 8 KiB headers, 32 connections,
10-second HTTP deadline. Discovery bodies are limited to 64 KiB for batches and 8 KiB
for review/evidence. Tests exercise a valid batch above 8 KiB through the actual Node
transport. Requests are limited to 60/minute/process. Transactions use the existing
advisory lock with 3-second lock, 5-second statement and 8-second transaction limits.
Queue pages contain at most 20 candidates; each has at most 32 evidence records,
20 identity findings and 32 review decisions. Excess fails closed. Logs and error
responses contain fixed events/codes and opaque IDs, not company payloads or tokens.

## Historical pre-audit verification

| Check | Result |
| --- | --- |
| Test-first domain contract | Failed before implementation (missing modules), then passed |
| `pnpm test:acquisition` | 100 tests passed in 11 files, including the original 70 Task 0082 tests |
| `pnpm db:acquisition:check` | Passed with approved host access after Windows user-profile sandbox error |
| `pnpm test:acquisition:disposable` | 41 PostgreSQL tests passed: 22 Task 0082 and 19 discovery; both database log-privacy probes passed |
| `pnpm lint` / `pnpm typecheck` | Passed on the final code |
| `pnpm test --maxWorkers=2` | 2,625 tests passed in 262 files with approved host access |
| `pnpm build` | Passed; 81 static pages; no discovery App Router endpoint |
| `git diff --check` and untracked-file whitespace inspection | Passed |

The first full-suite sandbox run passed 2,623 tests and failed the two unchanged
Task Scheduler validate-only/tsx user-info checks (`0x80070003`, `uv_os_get_passwd`
ENOMEM). No related test was modified or weakened. The unchanged host-access rerun
passed all 2,625 tests. No Task Scheduler registration or live IndexNow request was
introduced; the existing validation-only/entrypoint tests were rerun as written.

## Corrections and disposable proof

- Drizzle initially emitted the composite review/finding foreign key before its unique
  index. Fresh migration failed with SQLSTATE 42830. The new migration now creates the
  index first; the next fresh migration succeeded. `0000` was not edited.
- Task 0082's old nine-table count failed after the six-table addition. Its assertion
  now checks the exact original nine plus new six table names, preserving isolation
  and role checks. All 22 PostgreSQL regressions then passed.
- Concurrent status queries on a single PostgreSQL client produced a driver warning;
  status projection now queries sequentially within the transaction.
- Initial sandbox Docker build access failed; the unchanged guarded harness ran with
  approved Docker access. No persistent environment was substituted.

Successful disposable project: `yolpol-acq-test-c6828e8746194061aed4958d803557fe`.
The harness removed only its own verified containers/networks and generated temporary
credential directory. Its databases were tmpfs-backed, with no host ports or named
volumes. The expiry test uses the guarded disposable admin solely to construct an
expired historical fixture; ordinary runtime cannot modify deadlines or disable guards.
Container images/build cache remain local; no existing Docker volume was deleted.
Read-only Docker inspection confirmed zero remaining containers/networks for the
successful project and the earlier attempts `fa924ff5c50149b487cfed8f3f5bca3e`,
`cdcc21d46f56402088c00d9394586854` and `27e9f6055f0143db98d84bde2d77d5f8`
(all under the `yolpol-acq-test-` prefix).

## Documentation and operating limits

ADR 0005, architecture, runbook, roadmap and subsequent CI coverage document this
boundary. Task 0082 now explicitly records PR #168 and its historical final evidence
(70 acquisition, 22 PostgreSQL, 2,595 full-suite tests), retaining its earlier tables.
The CI workflow itself already discovers the new tests and migration metadata.

No persistent stack, real source, company/contact dataset, provider, outreach,
Staging, Production or VPS operation was performed. The n8n manual runtime workflow
was not rerun; its workflow/network/security contracts passed static regression tests.
Reviewer credentials identify a configured credential principal, not a physical user.
Windows file ACL protection remains an operator responsibility. Physical disposal,
stronger human authentication, identity merges, real-source rights/adapters, Phase B
promotion and any activation remain deferred. Independent security/architecture audit
is required before Git publication. All implementation changes remain uncommitted.

## Historical pre-audit file inventory and handoff

Nine tracked files modified:

- `deploy/customer-acquisition/README.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/roadmap/ROADMAP.md`
- `docs/tasks/0051-ci-validation-foundation.md`
- `docs/tasks/0082-customer-acquisition-automation-foundation.md`
- `drizzle-customer-acquisition/meta/_journal.json`
- `drizzle.customer-acquisition.config.ts`
- `src/composition/customer-acquisition/customer-acquisition-service.ts`
- `src/features/customer-acquisition/infrastructure/__tests__/postgres-acquisition.integration.test.ts`

Twenty-five new, untracked task files (included in review; ordinary git diff omits them):

- `docs/adr/0005-company-discovery-candidate-review-boundary.md`
- `docs/tasks/0083-company-discovery-foundation.md`
- `drizzle-customer-acquisition/0001_company_discovery_foundation.sql`
- `drizzle-customer-acquisition/meta/0001_snapshot.json`
- `tooling/customer-acquisition/discovery-contract.test.ts`

The remaining twenty are under `src/features/customer-acquisition/`:

```text
application/__tests__/company-discovery.test.ts
application/ports/discovery-repository.ts
application/ports/discovery-source-registry.ts
application/use-cases/company-discovery.ts
domain/__tests__/discovery-policy.test.ts
domain/services/discovery-review-policy.ts
domain/services/discovery-source-policy.ts
domain/types/discovery-types.ts
domain/value-objects/discovery-values.ts
infrastructure/__tests__/discovery-http.test.ts
infrastructure/__tests__/postgres-discovery.integration.test.ts
infrastructure/config/discovery-auth-config.ts
infrastructure/config/discovery-source-registry.ts
infrastructure/http/discovery-handler.ts
infrastructure/persistence/postgres/repositories/postgres-discovery-repository.ts
infrastructure/persistence/postgres/schema/discovery-schema.ts
infrastructure/validation/discovery-input.ts
presentation/presenters/discovery-result-presenter.ts
testing/fakes/discovery-source-registry.ts
testing/fixtures/discovery-fixtures.ts
```

The generated snapshot preserves all nine prior table definitions exactly. Main
application migrations, existing acquisition SQL/snapshot, Compose, dependencies and
public application files are unchanged. HEAD remains the original develop merge;
index is empty and the protected stash object is unchanged. No commit/push/merge or
PR was performed. Independent audit should prioritize trigger/grant completeness,
concurrent review/replay/suppression interactions, fixture exclusion from production
composition, trusted reviewer attribution and effective expiry versus physical disposal.

## Historical security-correction handoff — 2026-10-10, before contract approval

This section preserves the exact pre-approval findings and test evidence. Its unresolved
expiry-contract decision and file counts are superseded by the final-correction handoff below.

### Verified resumption and preserved work

The original correction preflight found 9 modified tracked files, 25 untracked
files and an empty index. The later resume preflight found 11 modified tracked
files and 27 untracked files, still with an empty index. Existing discovery domain,
application, validation, HTTP, presentation and fixture work was retained rather
than restarted. Branch remains `feature/company-discovery-foundation`; HEAD is
`7731cf1b38f851a044be0e90e825379afbd0c959`.

Protected stash `377b4d94ea9cc7a029eee3197165c23333401ee7` remains the same
commit object and `refs/stash` target. No stash operation was performed.
The unchanged Git blob hashes are:

- Migration 0000: `99d5be0fecfa67a8faece16e197e4718559f4ef5`.
- Snapshot 0000: `efd0726b350abe459b391a55b03f0a0f4aae0f2e`.

### Corrections and executable evidence

| Finding | Current status | Regression evidence |
| --- | --- | --- |
| SEC-0083-01 | FIXED | Historical overlap, post-intake suppression/release, replay, changed batch keys/domain/source identity, backdated release and stale Task 0082 snapshots stay suppressed. Release before first intake remains eligible, including future-dated legacy metadata. |
| SEC-0083-02 | FIXED | Real acquisition/intake/reviewer connections reject direct discovery writes, cross-capability functions, SET ROLE escalation, policy/binding mutation and reviewer UUID/session-setting forgery. Missing/revoked bindings, changed/revoked/expired policy and stale transaction snapshots fail closed without partial history. |
| SEC-0083-03 | FIXED | Runtime cannot insert a complete future-dated batch; API rejects caller receipt timestamps. Database wall-clock receipt and policy/earliest-identity deadline bound retention to at most 168 actual hours. Deadline rewriting, replay and expired reintake remain rejected. |
| SEC-0083-04 | UNRESOLVED | Authorized reviewer BEGIN/function/SET CONSTRAINTS ALL IMMEDIATE/sleep/COMMIT succeeds after expiry and leaves APPROVED. The strict regression remains failing, not skipped or inverted. |
| SEC-0083-05 | FIXED | Database trigger rejects matches after terminal decisions and the twenty-first finding. Real intake creates the bounded valid findings; guarded owner-only fixtures test the trigger independently of revoked runtime privileges. |

These are local executable correction results, **not independent re-audit approval**.
No finding is classified NOT REPRODUCED. Overall acceptance/publication is BLOCKED
by SEC-0083-04 and pending independent security re-audit.

Test-first baseline project `yolpol-acq-test-f693a4d31fc7493a8ede5c6050ce15be`
ran 50 tests: 41 original tests passed and all 9 new attack regressions failed.
The forged acquisition-runtime review committed after policy revocation/change;
future-dated batches and post-terminal/excess findings were accepted. The early
constraint-evaluation transaction also committed after expiry.

Additional test-first runs exposed repeatable-read policy revocation bypass,
backdated release revival and incorrectly applied future-dated legacy release
metadata. Each assertion was retained and passed after its focused correction.
Bootstrap marker newline handling, Docker Desktop secret mode handling, and an
intermediate SQL quoting error were corrected; failed setup/migration attempts
were not counted as security proof.

### PostgreSQL authority and application path

| Identity | Authority |
| --- | --- |
| `acquisition_runtime` | Original Task 0082 grants only; no direct discovery privileges. Its existing suppression operations append discovery-owned observation events through a protected trigger. |
| `discovery_intake` | LOGIN, CONNECT/USAGE; EXECUTE submit and own-batch status only. |
| `discovery_reviewer` | LOGIN, CONNECT/USAGE; EXECUTE batch/queue/evidence/review only. No intake or canonical mutation. |
| `discovery_mutation_owner` | NOLOGIN, no elevated role flags; SELECT/INSERT on required discovery history, candidate state/version UPDATE only, SELECT protected authority and Task 0082 suppression. No runtime membership. |
| `discovery_provisioner` | NOLOGIN administrative authority; insert protected policy/binding records and irreversibly revoke. Cannot rewrite immutable policy/binding content. |

The guarded disposable administrator alone provisions roles/passwords, grants the
trusted migrator non-inherited SET authority for function installation and removes
installation-only owner schema CREATE before testing. No persistent installation
was provisioned. Normal Compose remains without discovery credential mounts or
approved policies. Independent random passwords are file-backed and never logged.

Protected bindings map `session_user` to a UUID/capability. Mutation functions derive
audit attribution from that binding and reject inconsistent expected UUIDs. Database
credential attribution is not physical-human proof. Compromise of the process holding
both capability credentials remains a separate trust boundary.

Protected immutable key/version policy snapshots contain source, method, allowed
fields, retention, approval/expiry/review provenance and canonical fingerprint;
administrative provenance/timestamps are database-set. Only revocation may change.
Every sensitive mutation/replay checks authoritative policy, not caller approval
claims. Repeatable/serializable transaction snapshots are refused to prevent hiding
committed revocation. Current eligibility checks use wall-clock time.

The actual repository is now a thin adapter to the five narrow SQL functions through
separate intake/reviewer pools, not a raw-table mutation path. The five API functions,
deferred completeness trigger and suppression observer are SECURITY DEFINER owned
by the least-privileged NOLOGIN owner, with safe search paths, qualified relations,
explicit EXECUTE grants and PUBLIC EXECUTE revoked. There is no caller-controlled
dynamic SQL. Helpers and trigger functions are not runtime-callable. Role flags,
temporary-table denial, memberships, table privileges and canonical-write denial
were tested with real connections.

A discovery-owned observation trigger records server-timed ACTIVE/RELEASE events
without rewriting Task 0082 suppression rows or changing its release semantics.
Observed event history takes precedence over caller-dated legacy metadata. Historical
overlap is retained for legacy entries predating observation. This captures suppression
even when a legacy caller holds a snapshot older than candidate creation.

Migration 0001 now creates nine discovery tables (18 acquisition tables total).
Drizzle SQL/schema/snapshot/journal remain in the original two-migration chain.
Offline generation reports no changes; disposable fresh migration succeeds.
Temporary generator-produced 0002 artifacts were folded into uncommitted 0001 and
removed; no existing migration/data was deleted. Task 0082's 22 PostgreSQL behavior
tests pass, and its exact original SQL/snapshot bytes and grants are preserved.

### SEC-0083-04 decision required

Strict `actual commit time < candidate expiry` cannot be guaranteed by this
caller-controlled function/transaction model. PostgreSQL permits forcing deferred
constraint triggers early; a later COMMIT has no additional queued validation.
This is an architecture boundary, not a reason to relax the regression or grants.

Proposed alternative, **not adopted**: authorize at the serialized database function
execution instant, retain that immutable historical decision even if commit finishes
later, and require fresh policy/suppression/expiry eligibility at every subsequent use.
The invariant would change from commit-time rejection to authorization-instant validity
plus current-use eligibility. Separate explicit user approval and revised tests are
required. Otherwise retain the strict invariant and design a separately reviewed
transaction/commit boundary. See [ADR 0005](../adr/0005-company-discovery-candidate-review-boundary.md)
and [PostgreSQL constraint timing](https://www.postgresql.org/docs/17/sql-set-constraints.html).

### Security-correction verification

| Check | Actual result |
| --- | --- |
| `pnpm test:acquisition` | 100 passed in 11 files. |
| `pnpm db:acquisition:check` | Passed with approved host access; offline generator also reports no schema changes. |
| `pnpm test:acquisition:disposable` | **Exit 1: 60 passed, 1 failed** (38 discovery pass, SEC-0083-04 fails, all 22 Task 0082 pass). Fresh migration succeeded. |
| `pnpm lint` | Passed. |
| `pnpm typecheck` | Passed. |
| `pnpm test --maxWorkers=2` | Approved host-access run: 2,625 passed in 262 files. Sandbox run: 2,623 passed, 2 environmental failures. |
| `pnpm build` | Passed, 81 static pages. |
| `git diff --check` and untracked whitespace inspection | Passed. |

The sandbox failures were the unchanged Windows Task Scheduler validate-only path
(`0x80070003`) and tsx Windows user lookup (`uv_os_get_passwd` ENOMEM). Their
unchanged host-access rerun passed; no unrelated assertion was weakened.

A subsequent full-suite recheck, overlapping disposable Docker work, passed 2,624
tests and hit one unchanged 30-second timeout in the Production Compose-model
validation test. No timeout or assertion was relaxed. An unchanged rerun after
disposable work finished passed all 2,625 tests in 262 files (102.82 seconds).
Final lint and typecheck also exited successfully. Read-only Docker inspection
confirmed zero containers and zero networks for the final disposable project.
JSON comparison confirmed that all nine original table definitions are identical
between snapshots 0000 and 0001 (18 total tables in 0001).

Final disposable project: `yolpol-acq-test-2f1dfa75d87b4e53ada75ebf54341d7f`.
Its two database containers/networks were removed by the ownership-checked harness;
only generated disposable secret directories were removed, with no existing volume
or persistent data targeted. Images/build cache remain. Effective PostgreSQL logging
settings were checked, but post-suite log-privacy probes were **not reached** because
the retained expiry regression fails. The n8n runtime workflow was not rerun.
No Production/Staging/VPS, provider, discovery source, outreach or real company data
was accessed or activated.

### Final file inventory

11 modified tracked files; 27 untracked files; zero staged files.
All remain local and uncommitted. The existing task/CI historical documentation
changes were preserved.

Modified tracked files:

```text
deploy/customer-acquisition/README.md
deploy/customer-acquisition/compose.validation.yaml
docs/architecture/ARCHITECTURE.md
docs/roadmap/ROADMAP.md
docs/tasks/0051-ci-validation-foundation.md
docs/tasks/0082-customer-acquisition-automation-foundation.md
drizzle-customer-acquisition/meta/_journal.json
drizzle.customer-acquisition.config.ts
src/composition/customer-acquisition/customer-acquisition-service.ts
src/features/customer-acquisition/infrastructure/__tests__/postgres-acquisition.integration.test.ts
tooling/customer-acquisition/run-disposable-validation.mjs
```

Untracked files (ordinary git diff omits these; all are included in this handoff):

```text
deploy/customer-acquisition/postgres/discovery-disposable-init.sql
docs/adr/0005-company-discovery-candidate-review-boundary.md
docs/tasks/0083-company-discovery-foundation.md
drizzle-customer-acquisition/0001_company_discovery_foundation.sql
drizzle-customer-acquisition/meta/0001_snapshot.json
src/features/customer-acquisition/application/__tests__/company-discovery.test.ts
src/features/customer-acquisition/application/ports/discovery-repository.ts
src/features/customer-acquisition/application/ports/discovery-source-registry.ts
src/features/customer-acquisition/application/use-cases/company-discovery.ts
src/features/customer-acquisition/domain/__tests__/discovery-policy.test.ts
src/features/customer-acquisition/domain/services/discovery-review-policy.ts
src/features/customer-acquisition/domain/services/discovery-source-policy.ts
src/features/customer-acquisition/domain/types/discovery-types.ts
src/features/customer-acquisition/domain/value-objects/discovery-values.ts
src/features/customer-acquisition/infrastructure/__tests__/discovery-http.test.ts
src/features/customer-acquisition/infrastructure/__tests__/postgres-discovery.integration.test.ts
src/features/customer-acquisition/infrastructure/config/discovery-auth-config.ts
src/features/customer-acquisition/infrastructure/config/discovery-database-config.ts
src/features/customer-acquisition/infrastructure/config/discovery-source-registry.ts
src/features/customer-acquisition/infrastructure/http/discovery-handler.ts
src/features/customer-acquisition/infrastructure/persistence/postgres/repositories/postgres-discovery-repository.ts
src/features/customer-acquisition/infrastructure/persistence/postgres/schema/discovery-schema.ts
src/features/customer-acquisition/infrastructure/validation/discovery-input.ts
src/features/customer-acquisition/presentation/presenters/discovery-result-presenter.ts
src/features/customer-acquisition/testing/fakes/discovery-source-registry.ts
src/features/customer-acquisition/testing/fixtures/discovery-fixtures.ts
tooling/customer-acquisition/discovery-contract.test.ts
```

### Independent re-audit priorities and stop state

Re-audit function ownership/ACLs and helper reachability; session-user attribution
and multi-credential process compromise; policy revocation under adversarial isolation
and concurrency; trigger execution after definer return; suppression event ordering,
historical overlap and legacy timestamps; direct SQL input validation and retention;
match insertion/count bounds; and the unresolved actual-commit expiry invariant.
Also review any future persistent provisioning/rotation/disposal contract separately.

No commit, push, PR, branch change, reset, merge, rebase, deployment, persistent
credential change or stash modification occurred. Stop here pending the expiry
architecture decision and independent security re-audit.

## Final authorization-time correction handoff — 2026-10-10

This section supersedes the historical SEC-0083-04 decision-required handoff above.
The user explicitly approved **Authorization-Time Validity + Fresh Eligibility
Checks at Every Subsequent Use**; the original defect and failed test evidence remain
in the historical sections, not retroactively relabelled as successful verification.

Phase A uses authorization-time validity and fresh eligibility checks at every subsequent use. It does not guarantee that PostgreSQL commits occur before the candidate's retention deadline.

### Resume preflight and preserved work

Branch `feature/company-discovery-foundation`, HEAD
`7731cf1b38f851a044be0e90e825379afbd0c959`; initial 11 modified tracked files,
27 untracked files, zero staged. The later resume check found 11 modified tracked,
29 untracked: only the new eligibility policy and its domain test increased the count.
Protected `refs/stash` and commit object remain
`377b4d94ea9cc7a029eee3197165c23333401ee7`. No existing work was reverted.

Previously completed monotonic suppression, separate PostgreSQL identities/protected
authority, server retention and bounded identity-match corrections were preserved.
Task 0082 semantics, ordinary Compose and original migration/snapshot remain unchanged.
`0000` SQL Git blob is `99d5be0fecfa67a8faece16e197e4718559f4ef5`; snapshot blob is
`efd0726b350abe459b391a55b03f0a0f4aae0f2e`, both equal HEAD.

### Completed correction

The private PostgreSQL status function is the shared current eligibility policy for
reads, mutation guards and replay checks. It gathers protected policy/fingerprint,
suppression, identity and evidence facts, then samples `clock_timestamp()` and compares
candidate/policy deadlines. Review/evidence BEFORE INSERT guards use this final sample
as authorization time and store it in immutable `created_at`. Principal binding,
capability, expected version, lifecycle, finding ownership and limits are checked under
the shared transaction/row locks. Existing conservative candidate-update expiry checks
are retained. No client or transaction-start timestamp authorizes a decision.

Historical `state` and `version` remain unchanged on expiry/revocation/suppression.
Batch and queue projections add `eligibility` with contract `authorization-time-v1`,
database `evaluatedAt` and an explicit status. Precedence is EXPIRED, POLICY_DENIED,
SUPPRESSED, TERMINAL, IDENTITY_CONFLICT, EVIDENCE_REQUIRED, then CURRENTLY_APPROVED or
READY_FOR_APPROVAL. Queue history is visible but never implicitly actionable. Current
eligibility is an observation, not a reusable permission; all later actions revalidate.
Approval remains terminal except for permitted suppression, and no downstream action
or canonical promotion exists. Phase B must independently revalidate eligibility.
Physical disposal is still deferred and requires a separately authorized design.

The pure domain policy consumes trusted expiry/policy/suppression/identity/evidence
facts, rather than recalculating database microsecond timestamps with JavaScript's
millisecond Date precision. Database/domain parity is exercised across approval,
expiry, revocation, suppression, terminal and conflict/evidence states. The application
port requires this result; batch and queue presenters explicitly preserve it. Receipt
formats remain opaque identifiers only, with no cached state or eligibility.

### Test-first evidence and security coverage

The new domain policy test first failed on its absent module. Disposable project
`yolpol-acq-test-f5f964cb640547e4bc1d397a8cb3f74c` then produced **61 passed, 5 failed**:
the new current-eligibility assertions were missing. All 22 Task 0082 tests passed.
After implementation, project `yolpol-acq-test-1ebacac2282d45d9880c991bbdc1c0ac`
passed **66/66** and both PostgreSQL log-privacy probes. This was intermediate evidence;
additional parity/cross-principal/evidence-replay coverage was added before final validation.
A sub-millisecond domain comparison regression was also reproduced red, then corrected
by retaining the authoritative database expiry fact instead of rounding its clock.

The early SET CONSTRAINTS ALL IMMEDIATE reproduction is retained. Its acceptance
criteria intentionally changed with user approval: a decision authorized pre-expiry
may commit later, but reads immediately show historical APPROVED/current EXPIRED and
every later evidence/review/batch replay or strong-identity reintake fails. History,
operation counts and deadlines remain unchanged, including under a newly provisioned
disposable intake principal. BEGIN before expiry does not authorize a later mutation.
Concurrent reviewers spanning expiry cannot record a contradictory/stale decision.

Protected provisioner revocation after approval leaves history intact and denies
mutations/replay; source-policy fingerprint changes and repeatable-snapshot attacks
remain covered. Suppression after approval remains effective after Task 0082 release,
including changed domain/source identity, batch key and protected principal.

No PostgreSQL grants, function signatures, owners or role memberships were widened.
The five capability APIs and two private definer triggers retain safe ownership/search
paths. Tests use actual intake/reviewer/runtime credentials to deny direct table access,
role escalation, impersonation, session-setting authority, policy forgery and canonical
writes. NOLOGIN owner/provisioner roles retain distinct, restricted purposes; installation
CREATE is revoked. Normal runtime still has zero approved sources and no activated
discovery credentials. New positive policies and bindings exist only in guarded fixtures.

### Final verification

| Check | Actual final result |
| --- | --- |
| `pnpm test:acquisition` | PASS: 113 tests, 12 files |
| `pnpm db:acquisition:check` | PASS |
| `pnpm db:acquisition:generate` (additional offline drift check) | PASS: 18 tables, no schema changes, no generated migration |
| `pnpm test:acquisition:disposable` | PASS: 68 tests; 46 discovery/security and all 22 Task 0082 regressions |
| PostgreSQL log privacy | PASS for both acquisition and n8n databases: effective settings plus duplicate email/domain probes, safe errors visible and payload/details absent |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test --maxWorkers=2` | PASS: 2,638 tests, 263 files, 110.89 seconds |
| `pnpm build` | PASS: 81 static pages generated |
| `git diff --check` | PASS |

The final disposable project was
`yolpol-acq-test-4a273a53fa8f4d0085831b1be90229ac`; fresh migration succeeded before
tests and post-suite privacy probes. Its test duration was 29.77 seconds. Read-only
Docker checks after cleanup found no remaining containers or networks for this project.
No persistent database was migrated. Snapshot chain verification confirms 18 total
tables, all nine original table definitions identical, and the correct previous snapshot
ID. The original SQL/snapshot bytes still match HEAD; journal remains 0000 then 0001.

Environmental failures are not counted as passes: the first sandboxed disposable
attempt stopped on Docker config/buildx access denial before tests, and the first
offline metadata check failed with `uv_os_get_passwd ... ENOMEM`. Unchanged commands
were rerun with approved host access and passed. Focused sandbox runs emitted Docker
config permission warnings but exited successfully. The full suite ran once in this
final execution with approved host access; the older handoff's full-suite results are
not reused as current evidence. No test assertion was weakened for these environment issues.

| Finding | Final repository/disposable status |
| --- | --- |
| SEC-0083-01 | FIXED: suppression remains monotonic across release, identities and principals |
| SEC-0083-02 | FIXED: real-role ACL, binding, policy authority and stale-snapshot negatives pass |
| SEC-0083-03 | FIXED: database timestamps, immutable bounded/inherited retention and future-input negatives pass |
| SEC-0083-04 | FIXED UNDER APPROVED CONTRACT: authorization-time, early-constraint late commit and all fresh-use/replay scenarios pass |
| SEC-0083-05 | FIXED: terminal identity insertion and maximum finding count negatives pass |

Final result: COMPLETE for the authorized local correction and verification; independent
re-audit and explicit authorization are still required before publication or activation.

### Complete final file inventory

11 tracked modifications; all unstaged:

```text
deploy/customer-acquisition/README.md
deploy/customer-acquisition/compose.validation.yaml
docs/architecture/ARCHITECTURE.md
docs/roadmap/ROADMAP.md
docs/tasks/0051-ci-validation-foundation.md
docs/tasks/0082-customer-acquisition-automation-foundation.md
drizzle-customer-acquisition/meta/_journal.json
drizzle.customer-acquisition.config.ts
src/composition/customer-acquisition/customer-acquisition-service.ts
src/features/customer-acquisition/infrastructure/__tests__/postgres-acquisition.integration.test.ts
tooling/customer-acquisition/run-disposable-validation.mjs
```

29 untracked files; all preserved and uncommitted:

```text
deploy/customer-acquisition/postgres/discovery-disposable-init.sql
docs/adr/0005-company-discovery-candidate-review-boundary.md
docs/tasks/0083-company-discovery-foundation.md
drizzle-customer-acquisition/0001_company_discovery_foundation.sql
drizzle-customer-acquisition/meta/0001_snapshot.json
src/features/customer-acquisition/application/__tests__/company-discovery.test.ts
src/features/customer-acquisition/application/ports/discovery-repository.ts
src/features/customer-acquisition/application/ports/discovery-source-registry.ts
src/features/customer-acquisition/application/use-cases/company-discovery.ts
src/features/customer-acquisition/domain/__tests__/discovery-eligibility.test.ts
src/features/customer-acquisition/domain/__tests__/discovery-policy.test.ts
src/features/customer-acquisition/domain/services/discovery-eligibility.ts
src/features/customer-acquisition/domain/services/discovery-review-policy.ts
src/features/customer-acquisition/domain/services/discovery-source-policy.ts
src/features/customer-acquisition/domain/types/discovery-types.ts
src/features/customer-acquisition/domain/value-objects/discovery-values.ts
src/features/customer-acquisition/infrastructure/__tests__/discovery-http.test.ts
src/features/customer-acquisition/infrastructure/__tests__/postgres-discovery.integration.test.ts
src/features/customer-acquisition/infrastructure/config/discovery-auth-config.ts
src/features/customer-acquisition/infrastructure/config/discovery-database-config.ts
src/features/customer-acquisition/infrastructure/config/discovery-source-registry.ts
src/features/customer-acquisition/infrastructure/http/discovery-handler.ts
src/features/customer-acquisition/infrastructure/persistence/postgres/repositories/postgres-discovery-repository.ts
src/features/customer-acquisition/infrastructure/persistence/postgres/schema/discovery-schema.ts
src/features/customer-acquisition/infrastructure/validation/discovery-input.ts
src/features/customer-acquisition/presentation/presenters/discovery-result-presenter.ts
src/features/customer-acquisition/testing/fakes/discovery-source-registry.ts
src/features/customer-acquisition/testing/fixtures/discovery-fixtures.ts
tooling/customer-acquisition/discovery-contract.test.ts
```

This final-correction execution edited the five requested documents, migration 0001's
private eligibility/history functions, the application result port, batch/queue
presenters and discovery HTTP/PostgreSQL tests, and added the eligibility policy/test.
All remaining inventory is preserved earlier work, including Task 0082/CI historical
documentation and the trust-boundary provisioning/harness implementation.

### Remaining limitations and independent re-audit

Independent re-audit should focus on the authorization instant and every subsequent
use/replay, status/domain/presenter parity, policy revocation while waiting for locks,
early constraint evaluation and concurrent expiry, role/helper ACLs and session-user
attribution, suppression overlap across release/principal changes, and immutable
retention plus match lifecycle/count limits. Review future Phase B eligibility
revalidation separately; historical approval is not a promotion/outreach entitlement.

The process holding both capability credentials remains trusted for both; database
attribution is not proof of physical human identity. Trusted administrator/provisioner
compromise is outside the runtime threat boundary. Physical disposal, persistent
credential provisioning, real-source approval and operational activation remain
separate work. No new architectural decision is needed for this approved Phase A
contract. Publication still requires independent re-audit and explicit authorization.

No commit, amend, push, PR, merge, reset, rebase, branch change, protected-stash change,
deployment or persistent credential/database mutation was performed. No real business
data, external discovery, outreach or AI provider activation was used. VPS, Staging
and Production were untouched. Only each newly created guarded tmpfs test project's
resources were cleaned up by its identity-checked harness; no pre-existing Docker
resource or volume was deleted. Stop pending Independent Re-Audit.

## AUD-0083-T01 focused test correction — 2026-10-10

The independent re-audit verified the five production corrections at source level,
but identified ineffective lifecycle/count regression protection. The old terminal
pairs shared no strong identity; the proposed twenty-first weak pair shared no name.
Both could still reject on identity-kind validation if their intended guard vanished.
Earlier execution counts above remain historical, not proof that those guards were isolated.

This authorized correction changes only the discovery integration test and this evidence
addendum. Terminal cases use distinct same-domain/different-name candidates and cover
APPROVED, REJECTED, SUPPRESSED and DUPLICATE. Rolled-back owner-role controls first prove
the identical relationship can be inserted. The count fixture uses ten name matches,
ten domain matches and one source-record match, avoiding the separate intake limit.
It checks successful findings 1–19 and 20, then rejection of valid finding 21.
Actual acquisition/intake/reviewer connections must reject fully populated valid
INSERTs with SQLSTATE 42501. Candidate/history/finding snapshots must remain unchanged.

Mutation proof runs only inside the marker-guarded disposable integration database:
copy the installed match-trigger definition, replace exactly one predicate with false,
invoke the same rejection assertion, require its assertion failure because INSERT
succeeded, then roll back the whole transaction. The original function definition is
checked after rollback. Repository migration SQL, grants and other predicates are not
changed; no persistent database or new runtime permission is involved.

### Executed correction evidence

Disposable project `yolpol-acq-test-fbb2beeaf3014db9848080c7b5a83272` migrated freshly
and passed 70 PostgreSQL tests (48 discovery, all 22 Task 0082) in 49.69 seconds.
The four terminal cases each accepted their valid positive control, rolled it back,
then rejected the post-transition insertion with P0001 / `Discovery finding rejected`.
The count case accepted the proposed twenty-first pair in its rolled-back control,
committed findings 1–19 and 20, then rejected finding 21 and retained exactly 20.
Candidate state/version/deadline, review/evidence history and receipts were unchanged
by every rejected insertion and every rolled-back experiment.

All three real runtime connections reported their expected session identity and
rejected fully populated, otherwise-valid finding INSERTs with SQLSTATE 42501.
The owner-role control accepted the same relationship. No grants were widened.

Five mutation experiments executed successfully: four lifecycle states and one count
case. Removing only the targeted predicate let INSERT succeed and caused the shared
rejection assertion to fail with Vitest `AssertionError` / `promise resolved`.
The experiment required that specific assertion failure, not a PostgreSQL validation
error. Every transaction rolled back, and the installed function definition matched
its original afterward. These are executed mutation results, not inferred coverage.

| Check | Actual correction-run result |
| --- | --- |
| `pnpm test:acquisition` | PASS: 113 tests, 12 files |
| `pnpm db:acquisition:check` | PASS with approved host access |
| `pnpm test:acquisition:disposable` | PASS: 70 tests, 2 files; 48 discovery and 22 Task 0082 |
| PostgreSQL log-privacy probes | PASS for acquisition and n8n; safe errors visible, sentinel/details absent |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test --maxWorkers=2` | PASS: 2,638 tests, 263 files, 176.53 seconds |
| `pnpm build` | PASS: 81 static pages |
| `git diff --check` | PASS |

The initial sandbox Docker attempt failed on configuration/buildx access before test
execution; the unchanged guarded command passed with approved host access. The first
offline metadata check failed with Windows `uv_os_get_passwd` ENOMEM; its unchanged
approved-host rerun passed. These failed attempts are not counted as test passes.
The full suite used approved host access for existing Windows validate-only checks.

The harness removed only its own new disposable containers/networks and temporary
credentials; no existing volume or data was deleted. Approved read-only Docker checks
found no containers or networks for the successful project or the initial failed
project `yolpol-acq-test-59b7c85625414ecca707340160dabf8b`. Images/build cache remain.

Final inventory remains exactly the 11 modified tracked and 29 untracked paths listed
in the complete final inventory above, with zero staged files. SHA-256 comparison
against this correction's preflight confirms only this document and
`src/features/customer-acquisition/infrastructure/__tests__/postgres-discovery.integration.test.ts`
changed. Production migration 0001, schema/metadata, privileges and application code
are unchanged from preflight. Migration 0000 and its snapshot retain the exact HEAD
blob hashes recorded above; snapshot 0001 still has 18 tables, the correct predecessor,
and all nine original table definitions unchanged.

Branch/HEAD remain `feature/company-discovery-foundation` /
`7731cf1b38f851a044be0e90e825379afbd0c959`. Protected stash object/refs remain
`377b4d94ea9cc7a029eee3197165c23333401ee7`; contents were not inspected. No commit,
push, merge, branch operation, persistent provisioning or external activation occurred.
No production defect or production security change was introduced by this correction.

Independent focused re-audit should verify the valid pair construction, rolled-back
controls, precise predicate substitutions, unchanged function/history assertions and
real-role permission denials. All authorized checks completed, but this implementation
handoff does not approve a commit or activation. Stop pending that independent re-audit.
