# Task 0086: Restricted Discovery Reader Authority

## Scope and starting state

Implementation began on `feature/acquisition-restricted-reader` at
`576543939fa0875273b671239a4558fa97a59faa`, with a clean worktree and
index, no unfinished Git operation, the expected origin, protected stash ref
`377b4d94ea9cc7a029eee3197165c23333401ee7`, and Task 0085 parked at
`590c010866feb3217bdd2ee10a215b3f76c8e476`. The stash contents were
not inspected. This task uses synthetic data and disposable PostgreSQL only.

## Authority and projection

Acquisition migration `0002_restricted_staff_discovery_reader` is additive and
independent of main YOLPOL Drizzle migrations. It creates one
`SECURITY DEFINER` function, `public.acquisition_staff_discovery_queue(uuid)`,
owned by dedicated `discovery_staff_read_owner` (`NOLOGIN`, `NOINHERIT`). The
owner has SELECT on discovery batches, candidates, evidence, identity matches,
reviews, suppression marks, policies and Task 0082 suppression entries. Its
only helper EXECUTE grants are `acquisition_discovery_status`,
`acquisition_discovery_policy` and `acquisition_discovery_blocked`. The owner
has no write grant or privileged role membership. The function fixes its
search path, refuses stale transaction isolation, takes a shared acquisition
authority lock, reads at most 21 ordered candidate IDs and returns at most 20.
It rejects more than 32 evidence records, 20 identity findings or 32 reviews,
and a review count inconsistent with candidate version. It returns only the
fields used by the Staff list, including historical state/version and a fresh
database-timed `authorization-time-v1` eligibility observation. The next cursor
is derived from the last returned ID and is validated and encoded by the adapter.
The function has no arbitrary filtering, dynamic SQL or candidate-by-ID path.

Disposable provisioning creates separate `discovery_staff_reader` (`LOGIN`,
`NOINHERIT`) and `discovery_staff_read_owner` identities. The login has
database CONNECT, public schema USAGE and an explicit EXECUTE grant on the
queue function. The historical Task 0082 trigger function retains PostgreSQL's
default PUBLIC EXECUTE ACL, but cannot be called directly. The reader cannot
SELECT discovery or canonical tables, execute discovery mutation
functions, change policy or suppression, set a privileged role, create objects,
or mutate records. `PUBLIC` has no EXECUTE on the new function. Provisioning
grants the migrator retained `INHERIT FALSE, SET TRUE` membership in both
function-owner roles and grants each owner temporary schema CREATE for ownership
transfer. The guarded runner revokes the schema CREATE grants after migration.
Roles are never provisioned by normal Compose.

The infrastructure adapter is a single-operation implementation of
`StaffDiscoveryReader`. It runs only when `ACQUISITION_DISPOSABLE_TEST=true`
and `ACQUISITION_MODE=synthetic-local`, reads a bounded protected secret file,
connects to the fixed internal host/database/role, uses a parameterized UUID
argument and bounded connection/query/statement timeouts, validates the result,
returns a safe unavailable state on error and releases its client to a shared,
two-connection pool. At most four reads are admitted at once; excess calls fail
safely, and pool acquisition has a three-second deadline. The disposable reader
LOGIN also has a cluster-wide connection limit of four. A 52
character base64url cursor encodes only a version and UUID; malformed and
noncanonical cursors fail closed. The Staff return shape was narrowed to the
fields actually rendered: evidence URLs, references, timestamps and other
candidate IDs do not cross this boundary.

## Staff and network boundary

The authenticated Staff route and `mayViewDiscoveryCandidates` policy remain
unchanged: valid `SUPER_ADMIN`, `ADMIN` and `SALES` principals may view;
`VIEWER`, invalid principals and revoked/expired sessions cannot invoke the
reader. The normal Staff composition still constructs
`UnconfiguredStaffDiscoveryReader`, so the real page remains unconfigured.
The database login is an infrastructure identity and does not attribute an
individual human reviewer. No Staff write path exists.

Only the guarded validation overlay mounts the reader secret and grants its
test process access to the internal acquisition database network. Normal
Compose retains internal Docker networks and no PostgreSQL host port. The
Next.js application has no acquisition network attachment, credential or
public bridge. The disposable harness uses UUID-scoped Compose resources,
tmpfs database storage, no named volumes or published ports, and scoped
cleanup. This work does not connect localhost:3000 to acquisition data.

## Verification and limits

The disposable PostgreSQL suite checks real role flags, effective function
ownership/ACL, no PUBLIC EXECUTE, denied DML/DDL/TRUNCATE, denied mutation
functions and role switching, protected and canonical table denial, bounded
pagination, malformed cursor/credential failure, excessive projection
rejection, expiry, suppression, policy revocation, historical APPROVED state
and a concurrent policy transition. The read uses the existing status helper,
whose server timestamp is observational. It does not authorize a later
promotion, contact or message; any later action must independently recheck
current authority. Physical retention/disposal remains deferred.

The first disposable run found that revoking PUBLIC EXECUTE after ownership
transfer under the migrator did not remove the effective grant. The migration
now switches to the new function owner for REVOKE and GRANT; the final run
inspected the actual ACL and passed all 78 PostgreSQL tests. The final guarded
run also passed both PostgreSQL log-privacy probes and removed its own
containers and networks. No persistent database migration was run.

| Initial implementation check, before independent audit | Result |
| --- | --- |
| `pnpm test:acquisition:disposable` | 78 PostgreSQL tests passed; log privacy probes passed |
| `pnpm db:acquisition:check` | Passed outside Windows sandbox after `uv_os_get_passwd` ENOMEM inside it |
| `pnpm test:acquisition` | 146 tests passed in 16 files |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed on the final code |
| `pnpm test --maxWorkers=2` | 2,672 tests passed in 267 files outside the Windows sandbox; the first sandbox run had 2,670 passes and only Task Scheduler 0x80070003 / tsx ENOMEM environmental failures |
| `pnpm build` | Passed; Staff acquisition remained dynamic and 81 public static pages generated |
| `git diff --check` and untracked formatting scan | Passed |

## Subsequent independent audit corrections

The first independent Task 0086 audit returned **FAIL — CORRECTIONS REQUIRED**.
The initial implementation results above describe the state before that audit;
they are not a security approval. At this correction stage, the following fixes
remained uncommitted and required further independent audit:

- **AUD-0086-01:** PostgreSQL's PUBLIC database privileges let the reader
  credential connect to `postgres` and create temporary objects there. The
  guarded disposable overlay now prepends reader-specific HBA allow and reject
  rules for both Unix sockets and TCP. The rules allow only
  `yolpol_acquisition` and reject every other database, including future ones.
  They are installed only during fresh tmpfs initialization; normal Compose and
  persistent PostgreSQL configuration are untouched. Integration tests inspect
  the ordered effective rules and exercise real connections with the reader
  credential. The disposable runner separately exercises socket connections.
- **AUD-0086-02:** The adapter now requires exact primitive types, closed keys
  at every object level, valid Gregorian UTC timestamps through microseconds,
  and consistency with `authorization-time-v1` eligibility precedence. It
  constructs new allowlisted DTOs. Invalid cursors fail before pool connection;
  malformed projections return the safe unavailable state. Positive synthetic
  current and historical cases remain covered.
- **AUD-0086-03:** A module-shared pool holds at most two reader connections,
  admits at most four concurrent reads and has a finite connection wait. The
  PostgreSQL LOGIN limit of four provides a separate server-side ceiling. A
  24-request test observes actual `pg_stat_activity` connections under a held
  authority lock, checks rejection of excess calls, verifies intake/reviewer
  availability, and checks release after success and timeout.
- **AUD-0086-04:** The deployment runbook now states the retained trusted
  `acquisition_migrator` memberships in both owner roles with `INHERIT FALSE,
  SET TRUE`. Only the owners' installation-time schema CREATE grants are
  revoked. Integration tests inspect membership options and final effective
  privileges.

| Correction-stage check | Result |
| --- | --- |
| `pnpm test:acquisition:disposable` | 80 PostgreSQL tests passed on a fresh tmpfs project; TCP and socket restrictions, HBA reload, concurrency, and both log-privacy probes passed; scoped resources removed |
| `pnpm test:acquisition` | 148 tests passed in 16 files |
| `pnpm db:acquisition:check` | Passed outside the managed Windows sandbox after its `uv_os_get_passwd` ENOMEM failure |
| `pnpm lint` and `pnpm exec tsc --noEmit --incremental false` | Passed |
| `pnpm test --maxWorkers=2` | 2,674 tests passed in 267 files outside the sandbox; the first run had only Task Scheduler path and `tsx` user-info environment failures |
| `pnpm build` | Passed; the normal Staff reader composition remained unconfigured |

At that correction stage, these results supported further independent security
review; they did not activate the reader in the normal Staff application.

## Final independent audit closure

The initial implementation is complete. The four security findings above and
later concurrency regression-test timing findings, including
`FINAL-AUD-0086-01` for late-opening connections, were corrected. The final
independent closure audit returned **PASS — READY FOR CONTROLLED COMMIT REVIEW**
with no remaining blocking security findings. It independently reran the
disposable PostgreSQL tests (82/82), Acquisition tests (148/148) and migration
check (PASS). It reviewed, rather than reran, correction-session evidence for
2,674/2,674 full-suite tests and passing lint, typecheck and build checks.

The subsequent controlled commit readiness review confirmed architectural and
security consistency and identified only outdated audit-status documentation,
reconciled here and in the roadmap. Task 0086 is ready for user commit approval
after this documentation reconciliation. Final commit review, commit approval,
push, PR and merge remain separate Git workflow decisions.

## Activation blockers

Independent security auditing is complete, but operational activation has not
occurred. Normal Staff composition still uses `UnconfiguredStaffDiscoveryReader`;
the restricted PostgreSQL reader was validated only with guarded disposable
synthetic infrastructure, and the normal Staff page is not connected to the
acquisition database. No persistent reader credentials or new private transport
have been provisioned or activated. Task 0086 was not activated in Staging or
Production.
A reviewed private Next.js-to-Acquisition transport, protected persistent secret
provisioning, non-disposable role provisioning/migration review and explicit
operational approval remain required. Real-company discovery is not authorized;
real-source permission and data governance reviews remain pending. Physical
data retention and disposal require a separate future design. Contact discovery
and outbound outreach are not activated.
