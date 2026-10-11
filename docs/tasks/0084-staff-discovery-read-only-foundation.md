# Task 0084: Staff Discovery Read-Only Foundation

## Purpose and starting state

Build a localized Staff observation page for Company Discovery without granting the
Next.js process reviewer authority. Task 0082 and Task 0083 were merged through PR
#168 and PR #169 respectively. Preflight on `develop` verified local HEAD and cached
`origin/develop` at `cb05f8e4a4fc731f170df2445f851d130efa24e5`, a clean index and
worktree, the expected origin, an unused feature branch and Task 0084 filename, and
protected stash identity `377b4d94ea9cc7a029eee3197165c23333401ee7`. The stash
contents were not inspected. Reported post-merge CI passed Production build, Quality
and disposable PostgreSQL integration checks; this is repository evidence, not live
discovery activation.

## Architecture and authorized scope

The route `/[locale]/staff/acquisition` lives under the existing authenticated Staff
layout. Staff session resolution and `StaffPrincipal` are unchanged. A new explicit
`mayViewDiscoveryCandidates` capability permits `SUPER_ADMIN`, `ADMIN` and `SALES` and
denies `VIEWER`; it validates the principal through the existing
`StaffAuthorizationPolicy`. The protected page checks the capability before reading,
and `ListStaffDiscoveryCandidates` checks it again before invoking its reader.
The Staff navigation item is capability-gated. No review or source activation control
exists.

The narrow `StaffDiscoveryReader.listCandidates(cursor)` port returns `available`
with candidates and an optional next cursor, or explicit `unavailable` with
`unconfigured` or `service_failure`. The application use case also returns
`forbidden`. A configured empty queue is `available` with zero candidates; it is not
the same as unconfigured. The production composition always injects
`UnconfiguredStaffDiscoveryReader`, which has no PostgreSQL, HTTP, environment or
reviewer credential dependency. The old reviewer repository has both reads and
writes and is not composed into the Staff web path.

The server-rendered component can show candidate name, country, domain, segment,
historical state, current eligibility and evaluation time, expiry, suppression,
policy state, evidence and identity finding summaries, and cursor pagination when an
authorized reader returns data. Historical `APPROVED` is labelled separately from
`CURRENTLY_APPROVED`; eligibility is observational and cannot authorize an action.
The normal runtime shows a localized unconfigured state. No candidate detail route
is implemented because the existing discovery API has no complete candidate-by-ID
read contract. No API route, migration, SQL grant, deployment setting, persistent
credential or live connection is added.

## Privacy and localization

The inherited Staff root layout remains dynamic, non-cacheable, noindex and
nofollow. The route is not in the public sitemap. Candidate data is never static
metadata or a client fixture. The four Staff locales are English, Turkish, Persian
and Arabic. The root Staff document sets `lang` and RTL/LTR direction; candidate
domains use a left-to-right isolate, dates and counts use locale formatting, and
the responsive list and pagination use semantic headings and labels.

## Synthetic-only validation and trust boundary

Deterministic test fakes use fictional `*.example` companies and reserved synthetic
identifiers. Their files live in the feature `testing` layer. A bundle dependency
check excludes fixtures, PostgreSQL discovery code, reviewer configuration and
credential code from the Staff read composition. The reviewer credential remains
write-capable and must never be injected into the web runtime. A future reader needs
a separately reviewed, genuinely restricted authority and PostgreSQL grants, with
fresh status evaluation and explicit operational approval before real data use.

## Evidence and file inventory

Focused tests cover Staff role mapping, malformed and denied principals, no reader
call for unauthorized roles, unconfigured versus empty results, multiple candidates,
pagination, reader failure, localized states, historical approval versus expired
eligibility, other eligibility outcomes, responsive and bidi-safe rendering, and
the inherited private route contract. `tooling/customer-acquisition/discovery-contract.test.ts`
checks the production composition dependency graph.

Validation on 2026-10-11:

- Final focused Staff discovery, Staff regression, navigation and architecture
  checks: 66 passed across 8 files. This includes four populated-list locale cases
  and the corrected acquisition App Router assertion.
- `pnpm typecheck`: passed; `pnpm build`: passed with the acquisition route dynamic.
- `pnpm lint`: passed without warnings on the final run.
- `pnpm test --maxWorkers=2`: 2,662 passed, three failed initially. One failure was
  the old acquisition App Router assertion; its corrected suite passed. The other
  failures were Windows Task Scheduler path access and a subprocess `uv_os_get_passwd
  returned ENOMEM` error. Those two unmodified tooling suites passed together outside
  the sandbox (7 tests). The full suite was not repeated after these targeted checks.
- `pnpm db:acquisition:check`: the sandboxed command twice hit the same Windows
  `uv_os_get_passwd returned ENOMEM` error; the same command passed outside the
  sandbox. No migration or persistent database operation ran.
- `git diff --check`: passed. The final Git status, complete file inventory and
  protected stash identity are included in the implementation handoff.

Changes are confined to Staff capability/policy/navigation, the protected Staff
acquisition page, a customer-acquisition read port/use case/unconfigured adapter,
the presentation component, four locale message files, deterministic tests, this
document, the Task 0083 subsequent-status note, and the roadmap.

Final tracked modifications (18):

```text
docs/roadmap/ROADMAP.md
docs/tasks/0083-company-discovery-foundation.md
src/app/[locale]/staff/(protected)/layout.tsx
src/features/inquiries/application/__tests__/receive-telegram-reply.test.ts
src/features/staff-authentication/application/__tests__/staff-authentication-use-cases.test.ts
src/features/staff-authentication/application/dto/staff-capabilities.ts
src/features/staff-authentication/application/policies/staff-authorization-policy.ts
src/features/staff-authentication/application/ports/staff-authentication-ports.ts
src/features/staff-authentication/presentation/__tests__/staff-panel-authentication.test.ts
src/i18n/messages/ar.json
src/i18n/messages/en.json
src/i18n/messages/fa.json
src/i18n/messages/tr.json
src/shared/presentation/staff-shell/__tests__/staff-shell.test.tsx
src/shared/presentation/staff-shell/staff-navigation.tsx
src/shared/presentation/staff-shell/staff-shell.tsx
tooling/customer-acquisition/acquisition-contract.test.ts
tooling/customer-acquisition/discovery-contract.test.ts
```

Final untracked Task 0084 files (11):

```text
docs/tasks/0084-staff-discovery-read-only-foundation.md
src/app/[locale]/staff/(protected)/acquisition/page.tsx
src/composition/customer-acquisition/staff-discovery.ts
src/features/customer-acquisition/application/__tests__/list-staff-discovery-candidates.test.ts
src/features/customer-acquisition/application/ports/staff-discovery-reader.ts
src/features/customer-acquisition/application/use-cases/list-staff-discovery-candidates.ts
src/features/customer-acquisition/infrastructure/readers/unconfigured-staff-discovery-reader.ts
src/features/customer-acquisition/presentation/__tests__/staff-discovery-list.test.tsx
src/features/customer-acquisition/presentation/__tests__/staff-discovery-page.test.tsx
src/features/customer-acquisition/presentation/components/staff-discovery-list.tsx
src/features/customer-acquisition/testing/fakes/staff-discovery-reader.ts
```

## Explicit limits

No real reader, reviewer write UI, candidate detail route, real-source approval,
canonical promotion, contact collection, outreach, migration, deployed credential,
VPS change or Production activation is part of Task 0084. Independent security and
architecture audit is required before publication. The next security task must
design a reader-only credential and PostgreSQL grant contract; the existing REVIEW
credential is not eligible for reuse.

## AUD-0084-01 focused correction (2026-10-11)

The independent audit found one LOW-severity presentation issue and no Critical,
High or Medium findings. The list treated every finding except `SUPPORTS` as
`CONTRADICTS`, so valid `SOURCE / OBSERVED` provenance appeared contradictory.
The Staff list now labels `SOURCE / OBSERVED` as neutral source observation,
retains distinct supporting and contradictory labels for the other valid evidence
kinds, and gives unexpected values a neutral unknown-finding label in all four
locales. The test-only candidate fixture includes source, supporting and
contradictory evidence; stored evidence and read-only production composition are
unchanged.

Four locale regression cases failed against the original mapping and passed after
the correction. Focused Staff/acquisition/architecture checks passed (72 tests),
including production fixture isolation. `pnpm lint`, `pnpm typecheck`, and
`pnpm build` passed. The initial sandboxed `pnpm test --maxWorkers=2` run had two
host-access failures (2,667 passed, 2 failed); the unchanged approved host-access
rerun passed all 2,669 tests across 266 files. The offline
`pnpm db:acquisition:check` also passed on an unchanged approved host-access retry
after a sandbox process lookup error. `git diff --check` and whitespace checks
across all 11 untracked Task 0084 files passed. No persistent database operation
ran.
