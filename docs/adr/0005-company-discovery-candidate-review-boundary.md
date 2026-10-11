# ADR 0005: Synthetic Company Discovery Candidates and Human Review

- Status: Authorization-time contract explicitly approved and implemented locally; independent re-audit required
- Date: 2026-10-10

## Decision

Keep discovery in the customer-acquisition bounded context, with separate domain
types, source policies, application port/use cases, validators, repository, HTTP
handler and presentation DTOs. Compose it into the existing private Node service.
ADR 0004's synthetic ingestion, fingerprints, canonical identity, suppression,
database credentials, migrations and no-egress topology retain their semantics.

Phase A separates batches, candidates, evidence, identity findings, reviews and
operation receipts from protected database principal/policy authority and suppression
event history (nine additive tables). It never promotes or writes canonical
company/domain/lead/contact/source-identity records. No future promotion table is
created. Approval means a synthetic candidate review decision only.

Production composition hardwires the code-owned registry. Ege, TOBB and company-site
policy entries are REQUIRES_REVIEW; no source is approved. The positive fixture
registry lives in testing and is injected only by tests. No environment variable
or request field selects a registry. The API bundle dependency graph is tested for
absence of testing/fixture code. There is no network adapter.

HTTP intake and review use independent file-backed credentials, separate from the
Task 0082 token. Database intake and reviewer LOGIN identities are also distinct.
Protected principal bindings derive attribution from PostgreSQL `session_user`;
an expected UUID is checked for equality, never accepted as authority. Missing or
revoked bindings deny access. Session settings and caller-selected roles cannot
choose another reviewer. This proves database credential attribution, not physical
human identity. A compromised application holding both capability credentials can
exercise both capabilities; that process remains a separate trust boundary.

The NOLOGIN `discovery_provisioner` authority inserts versioned policy/binding rows
and may irreversibly revoke them; it cannot edit their immutable contents. Trusted
administration is outside the hostile-runtime boundary. Policy snapshots include
source identity, method, exact allowed fields, approval/expiry, retention and review
provenance; a SHA-256 fingerprint binds their canonical serialization. Database
provenance records `session_user` and wall-clock time, not caller attribution.
Sensitive functions independently consult this authority, including replay. Unknown,
revoked, expired or fingerprint-mismatched policy fails closed. Repeatable/serializable
snapshots are refused, since they could conceal a newer revocation. Normal runtime
has no approved policy; fixture authority is inserted only by disposable test provisioning.

## Integrity and lifecycle

Batch intake is atomic, limited to 20 fictional company candidates and reserved
domains/URLs. Source evidence and candidate facts are immutable. Exact domain or
source-record collisions produce findings; normalized name/country matches are weak
findings. Only weak findings may be resolved as distinct, through appended reviews.
Strong conflicts are retained for rejection/duplicate/suppression decisions; Phase A
has no merge or canonical resolution mechanism.

The source policy determines an immutable deadline capped at seven days. Repeated
strong identities inherit the earliest existing deadline. Expiry is checked during
reads and writes, independently of any scheduler. Physical disposal is deferred and
requires a separate restricted contract before real-data use.

Rejection, duplicate and suppression are terminal. Approval can only transition to
suppression. Current exact-domain Task 0082 suppression is read-only input. A fresh
batch cannot bypass an existing discovery suppression by changing its key; either
matching domain or source identity carries the block. Releasing Task 0082 suppression
does not revive a discovery candidate. A discovery-owned observation trigger appends
server-timed ACTIVE/RELEASE events, without changing Task 0082 rows, grants or release
semantics. Their overlap survives forged legacy timestamps and stale legacy candidate
snapshots; already-released periods do not taint newly created eligible candidates.
The observation trigger is also a private, least-owner SECURITY DEFINER function.
Stored approval is not current eligibility.

Operations use a separate (principal, kind, key) namespace. Policy metadata and
canonical facts participate in fingerprints. Authentication, policy validity,
candidate expiry and suppression are checked before historical replay. Results
contain opaque receipt IDs, never eligibility states. Current status is a separate
projection including expiry, suppression and policy validity.

The existing transaction advisory lock coordinates with Task 0082 suppression.
PostgreSQL checks and triggers enforce batch completeness, source evidence, immutable
facts, deadlines, terminal transitions, required review linkage, evidence requirements
and reviewer-finding ownership. `acquisition_runtime` has no discovery grants; its
Task 0082 grants remain unchanged. Discovery logins have only CONNECT, schema USAGE
and the appropriate API function EXECUTE grants, not direct table access. Intake can
submit/read its batches; reviewer can read the queue/batches and add evidence/reviews.
Neither can SET ROLE into another capability, provisioner, migrator or owner.

The five API functions are SECURITY DEFINER, owned by `discovery_mutation_owner`,
a dedicated NOLOGIN role with only required table/column privileges. Deferred
completeness checks also execute as that owner after an API function has returned.
Search paths explicitly use `pg_catalog, pg_temp`, relation references are qualified,
PUBLIC EXECUTE is revoked, and helpers are not runtime-callable. No caller-controlled
dynamic SQL exists. TEMP/DDL privileges are absent. Installation-only schema CREATE
for ownership transfer is revoked by the guarded administrator before tests.

The actual TypeScript repository calls these functions through separate pools;
it no longer performs discovery table mutations. Passwords are independent,
file-backed, fixed-role configurations. POSIX private-file checks remain strict;
Docker Desktop test mounts are copied to process-private files only inside the
guarded disposable fixture process. Windows host ACLs remain an operator obligation.

## Consequences

The normal runtime intentionally cannot accept discovery candidates: its registry
approves none, and normal Compose has no discovery credential mount. Positive proof
uses test composition inside the existing guarded disposable harness. New role and
credential provisioning exists only in its validation overlay; no persistent role,
credential, binding or approved source has been activated.

## Approved authorization-time contract (SEC-0083-04, 2026-10-10)

Phase A uses authorization-time validity and fresh eligibility checks at every subsequent use. It does not guarantee that PostgreSQL commits occur before the candidate's retention deadline.

The previous strict commit-before-expiry requirement failed the reviewer-credential
BEGIN/function/SET CONSTRAINTS ALL IMMEDIATE/wait/COMMIT reproduction. The user
explicitly replaced that requirement; the same reproduction remains in the suite.
It now requires immutable APPROVED history plus EXPIRED current eligibility and
denial of every subsequent positive mutation/replay. Deferred completeness triggers
remain integrity checks, not unconditional commit-time expiry hooks.

The authorization instant is the `clock_timestamp()` sampled by private
`acquisition_discovery_status` at the end of gathering protected facts, invoked from
the BEFORE INSERT history guard. That instant is stored in the review/evidence
`created_at`. The API has already acquired the transaction advisory lock and checked
the protected `session_user` binding; the candidate row lock, expected version,
lifecycle, finding ownership and history bounds have been checked. The final shared
eligibility calculation checks candidate expiry, protected policy version/fingerprint,
approval/method/revocation/effective/expiry, monotonic suppression, unresolved identity
findings, other historical strong-identity approvals and required/noncontradictory
evidence. APPROVE requires READY_FOR_APPROVAL. Policy/binding changes and suppression
use the same advisory lock; read-committed-only calls see committed changes after a
wait. The candidate update also retains its conservative extra expiry check.

Batch status and reviewer queue preserve `state`/`version` as historical facts and
add mandatory `eligibility: {contract: "authorization-time-v1", evaluatedAt, status}`.
The additive contract leaves existing routes/receipt formats intact. Eligibility
precedence is EXPIRED, POLICY_DENIED, SUPPRESSED, TERMINAL (REJECTED/DUPLICATE),
IDENTITY_CONFLICT, EVIDENCE_REQUIRED, then CURRENTLY_APPROVED or READY_FOR_APPROVAL.
All underlying expiry/policy/suppression booleans remain visible even when a higher
priority reason wins. The pure domain policy specifies the same semantics; integration
tests compare it against database results. The application carries the typed result
and presenters explicitly project it for both reads. No client clock decides authority.

These are timestamped observations, never bearer capabilities or a cached permission
for another action. CURRENTLY_APPROVED is historical approval still satisfying current
eligibility, not permission for another approval, outreach or promotion. Terminal
transition/version/count limits still apply. Identity-conflicted or evidence-incomplete
candidates can receive permitted evidence/review, but cannot be approved. SUPPRESS
remains the sole allowed transition from APPROVED and can record a current block;
even that operation still requires valid policy and unexpired retention. Queue entries
include history for review visibility, not an assertion that every row is actionable.

Every evidence/review/replay rechecks current policy, expiry and suppression inside
the database boundary. Receipts contain only opaque identifiers; expired/revoked/blocked
replays fail, without writes or renewed deadlines. Fresh intake checks protected policy
and inherits the earliest strong-identity deadline, including across principals. No
history is rewritten on expiry, revocation or suppression/release. Physical disposal
remains deferred. Phase B must independently revalidate eligibility inside any future
promotion mutation; no such mutation or downstream authorization exists in Phase A.

Publication/activation remains blocked pending independent security re-audit and
separate authorization, not by an unapproved expiry-contract decision.

PostgreSQL references: [constraint timing and early evaluation](https://www.postgresql.org/docs/17/sql-set-constraints.html)
and [wall-clock versus transaction time](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT),
plus [transaction snapshot semantics](https://www.postgresql.org/docs/17/transaction-iso.html).

The local queue exposes at most 20 candidates per page, 32 evidence records and 20
identity findings per candidate; review history is capped at 32 decisions. Exceeding
limits fails closed. One global lock is appropriate for this bounded synthetic phase;
larger-scale discovery, real-data retention/disposal, stronger individual reviewer
authentication, promotion and operational activation require subsequent work.
