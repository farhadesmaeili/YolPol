# Protected Team Operations Read API

## Purpose and scope

This phase exposes the existing Team Operations read use cases through Staff-only HTTP GET routes. It is an API foundation only: it adds no Staff UI, public registration, workflow mutation, assignment write, reply command, pricing capability, schema change, or migration.

The protected routes are:

- `GET /api/staff/inquiries`
- `GET /api/staff/inquiries/[inquiryId]`
- `GET /api/staff/team-members`

The App Router modules are dynamic Node.js routes and delegate directly to a server-only composition root. PostgreSQL adapters and Staff Authentication infrastructure are not imported by Client Components or exposed to browser bundles.

## Authentication and authorization

Authentication and authorization are separate checks. Each request first reads the existing environment-appropriate Staff session cookie and passes its opaque credential to `ResolveStaffSession`. No query parameter, route parameter, request body, or custom header can provide a Staff Account ID, Team Member ID, role, or actor reference.

The session resolver verifies the existing hash-only session credential and current session, Staff Account, and operational Team Member state. Missing, malformed, unknown, expired, or revoked sessions and inactive Staff Accounts or Team Members all receive the same `401` response. Resolver dependency failures receive a safe `503` response without PostgreSQL or credential details.

An authenticated principal is then checked through `StaffAuthorizationPolicy.mayPerformTeamOperations`. The existing policy grants this capability to valid `ADMIN` and `SALES` principals whose server-derived actor reference matches their trusted Team Member identity. A valid principal without the capability receives `403`, not `401`. Authentication grants no internal Product-pricing capability.

These read routes never accept or derive a workflow actor from the browser. Actor attribution remains deferred with mutation endpoints.

## Read composition and confidentiality

The HTTP adapter reuses `ListTeamInquiries`, `GetTeamInquiryDetail`, and `ListAssignableTeamMembers` from the existing server-only Team Operations composition. It does not contain SQL or reconstruct read models. Successful responses serialize the existing Team Operations application DTOs.

Those DTOs expose only the operational Inquiry, assignment, workflow-history, conversation-message, and Team Member fields required by the read use cases. They omit internal Product prices, Staff password hashes, Staff session credentials and digests, customer conversation access credentials and digests, Outbox internals, communication-recipient identifiers, provider secrets, environment values, and database details. `inquiry_team_members`, `staff_accounts`, and `communication_recipients` remain distinct models.

## List query and pagination

`GET /api/staff/inquiries` accepts exactly these optional query parameters:

- `status`: one existing Inquiry lifecycle status.
- `assignedTeamMemberId`: one URL-safe operational Team Member identifier.
- `unassigned=true`: select unassigned Inquiries.
- `cursor`: the opaque cursor produced by the previous response.
- `limit`: a base-10 integer from 1 through 100.

Every parameter may occur at most once. Unknown parameters, empty prohibited values, malformed integers, unsupported statuses, `unassigned` values other than `true`, and simultaneous `assignedTeamMemberId` plus `unassigned=true` return `400`. The HTTP parser creates the existing `ListTeamInquiriesInput`; the use case still performs its own page-size, status, assignment, Team Member ID, and cursor validation.

Pagination remains PostgreSQL keyset pagination ordered by `created_at DESC, id DESC`. The application use case retains the default page size of 25, maximum of 100, opaque composite cursor codec, 512-character cursor limit, `limit + 1` next-page detection, and safe `nextCursor` output. The HTTP layer does not decode cursors, replace keyset pagination, or add client-controlled sorting.

## HTTP behavior

All responses, including failures, use stable JSON and `Cache-Control: no-store`. The routes are explicitly dynamic and cannot be statically generated or publicly cached.

Error mapping is:

- unauthenticated: `401` with `unauthorized`
- authenticated without capability: `403` with `forbidden`
- invalid query or Inquiry ID: `400` with `invalid_request`
- valid but unknown Inquiry ID: `404` with `not_found`
- persistence, dependency, or unexpected adapter failure: `503` with `service_unavailable`

The GET routes require no request body and perform no JSON-body parsing. Unsupported query parameters are rejected. No process-local read rate limiter was invented because the repository has no established Staff-read limiter; deployment-level abuse controls can be designed separately if operational evidence requires them.

## Origin and CSRF decision

The existing exact Origin policy remains unchanged for the state-changing Staff login and logout POST routes. These new routes are GET-only and read-only, so they do not apply mutation-oriented Origin rejection. They rely on the existing `HttpOnly`, `SameSite=Strict`, production `Secure`, host-scoped Staff cookie and route-level authentication/authorization. This avoids rejecting legitimate authenticated browser GET requests while preserving the stricter login/logout protections.

## Deferred mutations

Status transitions, assignment and unassignment, Staff creation, password or session management, internal and customer replies, and panel UI remain intentionally deferred. Mutation routes require a separate review of capability granularity, server-derived actor attribution, Origin/CSRF enforcement, optimistic concurrency, audit history, and command-specific response contracts.
