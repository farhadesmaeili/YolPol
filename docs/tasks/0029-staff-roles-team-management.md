# Staff Roles and Team Management

## Scope and audit findings

This feature expands the closed Staff role model, centralizes capability authorization, introduces secure invitation-based Staff activation, and adds protected Team Management. It also makes Staff lifecycle changes effective for sessions, long-lived Staff SSE, and mapped Telegram replies.

The pre-change audit found two persisted roles (`ADMIN`, `SALES`), current-role resolution on every Staff session request, no role cached in a session row, a Staff SSE authorization check only at stream open, and a Telegram inbound path that could persist a human reply without a currently active linked Staff Account. Customer Conversation projections were already actor-free and remain unchanged.

Assignment-specific Inquiry authorization, Telegram Staff onboarding, public registration, direct administrator password assignment, generated passwords, and automatic promotion of an existing administrator remain outside this feature.

## Role and capability model

The domain parser and database constraint admit exactly `SUPER_ADMIN`, `ADMIN`, `SALES`, and `VIEWER`.

| Capability | SUPER_ADMIN | ADMIN | SALES | VIEWER |
| --- | --- | --- | --- | --- |
| Access Staff Panel | yes | yes | yes | yes |
| View Inquiries and Conversations | yes | yes | yes | yes |
| Reply, publish Staff typing, mutate workflow | yes | yes | yes | no |
| Manage Team | yes | yes, restricted targets | no | no |
| Invite ADMIN | yes | no | no | no |
| Invite SALES or VIEWER | yes | yes | no | no |
| Manage ADMIN or SUPER_ADMIN | yes, another account only | no | no | no |
| Promote an active account to SUPER_ADMIN | yes, another account only | no | no | no |

`StaffAuthorizationPolicy` is the server-side source for capability decisions. UI view models use the same policy to omit unavailable actions, but HTTP/application authorization and transactional current-state reauthorization remain authoritative. Direct role comparisons outside this policy are limited to domain constraints, the operator-only bootstrap eligibility rule, the last-active-SUPER_ADMIN persistence invariant, and the legacy provisioning restriction that prevents provisioning a SUPER_ADMIN.

## Invitation lifecycle and activation

An authorized Super Admin may create an `ADMIN`, `SALES`, or `VIEWER` invitation. An Admin may create only `SALES` or `VIEWER` invitations. A `SUPER_ADMIN` invitation is not representable in the invitation domain or table constraint.

The server issues a 256-bit `ypi_` activation credential. Domain-separated SHA-256 lookup and verification digests are stored; the raw credential is returned only in the successful creation response and held only in the creator's current React state for one-time copying. It is not written to PostgreSQL, logs, URL parameters, browser storage, or a customer DTO. The application-wide invitation lifetime constant is 24 hours. A preliminary application-clock check avoids unnecessary hashing for an invitation already known to be unavailable, but it is never authoritative for commit.

The invited person manually enters the invited email, one-time code, and chosen password on the localized Staff Activation page. The current Staff password policy is reused: 14 through 1,024 characters, followed by the existing versioned scrypt adapter. Invalid, malformed, unknown, wrong-email, expired, revoked, consumed, replayed, and conflicting invitations produce the neutral public `invitation_unavailable` result. Password-policy rejection remains separately actionable without revealing invitation existence.

Password scrypt remains outside the transaction and therefore outside the row-lock duration. Redemption then starts one PostgreSQL transaction, locks the invitation row, and samples `clock_timestamp()` in a separate statement after that lock is acquired. `CURRENT_TIMESTAMP`/`transaction_timestamp()` were deliberately not used because they report transaction-start time, and `statement_timestamp()` was not used because it reports statement-start time; either could predate a lock wait. The single sampled wall-clock instant is authoritative for the `now >= expires_at` boundary, identity timestamps, and conditional invitation consumption. Redemption then locks and reauthorizes the creator identity, rechecks code digest, email, terminal state, email conflict, creator active state, and creator's current authorization for the target role, creates the Team Member and Staff Account, and consumes the invitation atomically. A rollback leaves none of those changes. Activation and revocation now both acquire the invitation lock before actor/creator identity locks, removing their prior inverse lock order; no residual activation-versus-revocation deadlock risk is known. A partial unique index makes outstanding invitation behavior per normalized email deterministic; creation revokes an expired outstanding row before replacement. Consumed or revoked invitations are never restored.

There is no `/staff/register`, `/staff/signup`, `/api/staff/register`, `/api/staff/signup`, or equivalent account-creation route. The only browser account-creation boundary is valid invitation redemption.

## Team Management and self-protection

The protected localized Staff Team page shows display name, normalized email, role, combined account/team-member status, creation time, and only a linked/unlinked Telegram boolean. It does not expose Telegram identifiers, provider bindings, password hashes, session material, invitation digests, credentials, or environment configuration.

Super Admin actions target another account and cover the four roles, lifecycle changes, and invitation revocation within the approved target rules. Admin actions target only `SALES` and `VIEWER`, including `SALES` to/from `VIEWER`. Server policy denies self-role-change, self-deactivation, self-reactivation, Admin-to-Admin/Super-Admin targeting, Super Admin invitation creation, and every Team mutation by Sales or Viewer. Promotion to Super Admin additionally requires an existing active account.

## Last active Super Admin and bootstrap

Role demotion and deactivation take a constant transaction-scoped PostgreSQL advisory lock before locking current actor and target rows. While holding that serialization point, the repository counts Staff Accounts whose role is `SUPER_ADMIN` and whose Staff Account and linked Team Member are both active. An operation that would remove the last such identity returns `last_super_admin`. The constant lock is scoped only to Staff administration transactions and releases automatically at transaction end; it avoids a race between distinct target rows without holding a connection beyond the mutation.

No account is promoted automatically. `pnpm staff:bootstrap-super-admin` is an operator-only interactive TTY command with no accepted command-line arguments or secrets. It accepts an existing Staff Account identifier through the prompt, requires explicit confirmation, obtains the same advisory lock, refuses when an active Super Admin exists, and promotes only an active `ADMIN` linked to an active Team Member. The application invariant prevents the last active Super Admin from later being removed, so a successful first bootstrap makes subsequent bootstrap attempts unavailable. The command was added but was not executed as part of this task.

Direct `BootstrapSuperAdmin` application tests cover exact repository delegation for eligible, missing, inactive-account, inactive-Team-Member, wrong-role, existing-Super-Admin, validation-failure, and persistence-failure outcomes. The successful application result is exactly the sanitized `{status: "promoted"}` shape; account identifiers, password material, hashes, sessions, tokens, and credentials are not returned. CLI regression coverage additionally proves non-TTY and argument rejection, blank/invalid identifier rejection, cancellation for blank or non-`y`/`yes` confirmation, execution only for normalized `y`/`yes`, no repository call on cancellation, and sanitized output. Explicit account identifier entry remains mandatory; the command never auto-selects an Admin.

Guarded disposable PostgreSQL coverage proves that initial bootstrap changes only the selected Staff Account's `role` and `updated_at`. The linked Team Member, password hash, existing sessions, invitations, and Telegram recipient mapping remain byte-for-byte equivalent at the SQL projection boundary. Missing, inactive-account, inactive-Team-Member, Sales, and Viewer targets are rejected. An existing active Super Admin blocks bootstrap, sequential repetition promotes no second identity, and concurrent bootstrap transactions yield exactly one promotion and one `already_bootstrapped` result with exactly one final active Super Admin.

The same disposable coverage forces the Staff Account role update to violate a temporary test-only database constraint after the bootstrap transaction has started. The repository rolls back completely: the target remains Admin, Team Member/session/invitation state is unchanged, no identity is added, and no active Super Admin remains from the failed transaction. The constraint is removed in `finally`; no production test hook or schema change was introduced.

After a successful bootstrap, direct repository tests reject both deactivation and demotion of the sole active Super Admin as `last_super_admin`. A second active Super Admin is then established through the ordinary authorized role-change repository path; demotion and deactivation of one identity become safe while at least one active Super Admin remains. Concurrent bootstrap versus sole-Super-Admin demotion/deactivation is serialized by the shared transaction-scoped advisory lock: bootstrap observes the established Super Admin, the lifecycle mutation observes last-Super-Admin protection, and the final active count remains one.

## Deactivation, reactivation, and sessions

Deactivation reauthorizes current actor and target state inside a transaction, sets both Staff Account and linked Team Member inactive, and marks every unrevoked Staff session for that account revoked. It does not delete identities, Inquiries, Messages, or historical actor references.

Reactivation reauthorizes the same current state and sets both identity rows active. It never clears `staff_sessions.revoked_at`; old sessions remain unusable and the person must log in again. Role changes update only the Staff Account. Since session resolution joins the current Staff Account and Team Member on every request, role changes are visible on the next authenticated request without rewriting session rows.

This current-role projection is intentional for bootstrap as well. Disposable PostgreSQL coverage resolves an existing valid Admin session, promotes the linked account, and resolves the same credential as Super Admin on the next request. The session row is unchanged, no session is created, and no login is required. The linked Telegram recipient mapping and `staff:<teamMemberId>` actor identity also remain unchanged; current-role re-resolution sees Super Admin and `mayReplyToCustomerConversation` remains allowed. The test path constructs no provider adapter and makes no provider API call.

## Long-lived Staff SSE

Staff Conversation SSE now requires `mayViewCustomerConversation`, allowing Viewer read-only realtime access without reply or typing capability. After initial authorization, the handler re-resolves the same opaque session and current account/team state every 5 seconds. Checks never overlap and each has a 5-second timeout. Each check receives its own `AbortSignal`, threaded through session resolution and the repository port to the node-postgres adapter. Timeout, request abort, stream cancellation, or underlying message-session completion aborts the active check. Because the installed node-postgres query configuration has no `AbortSignal` option, the adapter uses the supported `PoolClient.release(true)` path: it destroys and removes only the short-lived client running that lookup, terminating the active PostgreSQL operation without retaining a stream-lifetime connection. Late promise settlement is ignored after cleanup. Unauthorized, inactive, expired, revoked, dependency-failed, or capability-denied results close the stream and clean its message session, typing subscription, authorization controller, timers, and abort listener.

The documented maximum authorization propagation delay remains 10 seconds: up to 5 seconds before the next poll plus the 5-second check timeout. At timeout or request abort, cancellation is signalled immediately and the active lookup connection is terminated rather than being allowed to run to its own database timeout. Each resolution acquires and releases one short-lived pooled client; no PostgreSQL connection is pinned for the stream lifetime. A Sales-to-Viewer role change retains read-only SSE access but removes reply, typing, and workflow mutation capability on the next independently authenticated mutation request. Deactivation closes the stream within the bound.

## Telegram capability enforcement

Inbound human Telegram replies now require an authorized `TEAM_MEMBER` recipient mapping, a linked active Team Member, a linked active Staff Account, current role resolution, and `mayReplyToCustomerConversation`. Only then is an `INTERNAL_USER` / `TELEGRAM` Message created with the server-derived `staff:<teamMemberId>` actor reference. Active Super Admin, Admin, and Sales retain reply behavior. Viewer, inactive Staff Account, inactive Team Member, missing Staff Account mapping, unmapped sender, and `TEAM_GROUP` identities cannot persist a human reply. Provider webhook responses remain neutral and no provider call is made by this feature.

## Customer confidentiality

Staff actor attribution remains operational-only. Customer history and SSE continue to project the public `YOLPOL Team` identity without Staff role, email, Staff Account ID, Team Member ID, actor reference, Telegram binding/ID, invitation/session data, or internal Product prices/costs/margins. Team Management DTOs are separate from Customer DTOs.

## E2E-discovered HTTP and development-origin hardening

The isolated local Development E2E exposed five boundary defects that were corrected without changing the authentication application use case or weakening production behavior.

The login form now has an explicit native `POST` action. Before hydration it can no longer fall back to a browser `GET`, so email and password cannot enter a URL path, query, or fragment. The login HTTP boundary continues to accept JSON for the hydrated client and now additionally accepts only the native form's `application/x-www-form-urlencoded` representation. Both representations are byte-bounded and normalized into the same authentication input; multipart and every other media type remain rejected. GET cannot authenticate, and authentication failures remain neutral.

A successful native login sets the same HttpOnly Staff session cookie as JSON login and returns `303`. The localized login form includes its locale as a non-secret form field. The HTTP boundary validates it against exactly `en`, `tr`, `fa`, and `ar`, then redirects to the same-origin `/{locale}/staff` route. Missing, malformed, wildcard, protocol-relative, URL-like, or unsupported locale values cannot influence a redirect and fall back to `/staff`. The hydrated JSON response and locale-aware React navigation remain unchanged.

Development browser script and hydration requests are permitted for exact `localhost` and `127.0.0.1` hosts plus, when explicitly configured, the single strictly parsed host from `YOLPOL_DEV_ORIGIN`. This affects only `NODE_ENV=development`; it adds no wildcard, suffix, private-range rule, arbitrary LAN trust, credential-bearing origin, or production exception.

The E2E also found that an unchanged Team mutation could be detected before current actor authorization, allowing an unauthorized caller to distinguish hidden state through the conflict response. Role and lifecycle repositories now lock and authorize the current actor and target before no-op detection, and regression coverage preserves that ordering.

## Migrations

Two Drizzle migrations were generated after `0010_customer_conversation_message_created.sql`:

1. `0011_staff_role_expansion.sql` drops and recreates only `staff_accounts_role_check`, keeping `varchar(16)` and preserving existing `ADMIN` and `SALES` rows without rewrite or enum conversion.
2. `0012_staff_invitations.sql` creates the digest-only invitation table, restrictive creator foreign key, role/digest/identity/lifecycle checks, unique lookup index, unique outstanding-email index, and expiry/creator indexes.

Both migrations are append-only and have static integrity coverage for all historical migration hashes through `0010`. The expiry and SSE cancellation fixes require no migration changes. Under a separate authorized migration task, development was backed up and migrations through `0012` were applied and verified; production remains untouched.

## Validation evidence

On 2026-08-29, the non-database focused application/CLI run passed 2 files and 52 tests. The guarded `pnpm test:integration` harness passed 5 files and 54 tests, including 8 dedicated first-Super-Admin bootstrap tests, against only the tmpfs-backed `postgres-test` service and guarded `yolpol_integration` database. The harness removed only its disposable container afterward. The real development bootstrap remains **NOT EXECUTED**: no development Staff role, identity, session, invitation, Team Member, or Telegram/provider state was changed by this test task.

The final feature and warning-remediation validation also ran `pnpm lint`, `pnpm typecheck`, the complete Vitest suite, `pnpm build`, `pnpm db:check`, `git diff --check`, and the guarded integration suite. No persistent Development database or volume was used by automated integration validation.

## Completed Development E2E

On 2026-08-29, the authorized Team Management lifecycle was completed in an isolated local Chrome profile using the existing Development Super Admin and exactly one existing synthetic Staff identity. No bootstrap, provisioning, additional root identity, provider call, production access, or persistent browser profile was used.

The verified lifecycle covered invitation creation and activation, deactivation and session invalidation, reactivation without reviving the old session, fresh login, Viewer Inquiry/Conversation/SSE reads, Viewer reply/typing/Team-mutation denial, Viewer-to-Sales elevation in the current session, Sales reply/typing capability, Sales-to-Viewer capability removal in the same session, Customer history/SSE confidentiality, and final cleanup. Authorization-before-no-op behavior and the localized native login corrections are covered by HTTP/presentation regression tests rather than another mutating Team run.

The final synthetic Development state is retained intentionally as historical E2E evidence:

- role `VIEWER`;
- Staff Account inactive;
- linked Team Member inactive;
- zero unrevoked sessions;
- no Telegram linkage.

The existing real Super Admin remained active and unchanged. One consumed Sales invitation and one revoked Admin invitation remain as non-secret lifecycle history. Development-only Website replies created by the capability checks remain attached to their local Conversation; they contain no credential or provider secret and were not deleted during the final audit.

Real Telegram-provider delivery, production access, physical/mobile-device viewport verification, and a live Telegram Staff onboarding flow were not performed. The four locale keysets, logical RTL/LTR styling, responsive structure, and localized accessible control names are covered statically and by presentation tests.

## Future work

Inquiry Assignment authorization remains a future capability/ACL integration and is not inferred from Staff role here. Telegram Staff Onboarding and binding administration also remain future work; this feature consumes only the existing mapping. Multi-replica ephemeral typing coordination remains separate from role management.
