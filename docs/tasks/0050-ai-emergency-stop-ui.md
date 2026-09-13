# AI Emergency Stop UI

## Goal and existing state

The Staff AI Operations page now exposes the existing global Operations switch as a clear emergency control. It does not introduce another flag, table, execution path, or cancellation mechanism.

The authoritative mutable state remains the singleton `ai_operation_policy` row. Persisted mode `DISABLED` prevents policy eligibility; `FALLBACK` and `SCHEDULED` retain their existing meanings. The separate `YOLPOL_AI_AUTOMATION_EMERGENCY_DISABLED` environment override remains read-only in Staff UI and can only force automation off. An active or invalid override therefore cannot be cleared by the new control.

## Staff authorization and security

All authenticated Staff roles may inspect status and policy history. Only `SUPER_ADMIN` and `ADMIN` may disable or re-enable automation. The existing application authorization policy enforces this server-side after session resolution; Sales and Viewer requests remain forbidden even if a client constructs a mutation directly.

The control reuses `PUT /api/staff/ai-operations`, including exact Origin validation, the HttpOnly Staff session, server-derived actor references, bounded exact JSON, rate limiting, safe error responses, and no-store responses. No browser-provided role, actor, redirect, secret, provider credential, or pricing data is accepted or exposed.

## Disable and re-enable semantics

Disabling requires an explicit accessible dialog confirming that automated Customer fallback and continuation responses will stop. After confirmation, the UI writes the existing policy with mode `DISABLED` while preserving its business timezone, human grace period, and schedule windows.

The repository saves the policy and immutable audit event atomically using the supplied expected version. In that same transaction, existing `PENDING` and `RUNNING` Conversation fallback jobs become `CANCELLED`. Customer-message insertion serializes with the policy row, so a concurrent new job is either cancelled by the disable transaction or observes the disabled policy. Re-enabling never resurrects cancelled work.

Re-enable restores the most recent audited non-disabled mode while preserving the current policy settings. If no prior enabled mode exists, the UI does not invent one: authorized Staff configure and deliberately enable `FALLBACK` or `SCHEDULED` in the existing policy form. Re-enable does not change human grace, schedule evaluation, continuation derivation, Agent logic, provider/profile eligibility, or routing behavior.

## Concurrency, audit, and failure handling

Every mutation sends the currently rendered policy version. The application and PostgreSQL repository retain their existing optimistic compare-and-swap checks; a stale update returns HTTP 409, leaves authoritative state unchanged, and remains visible as a conflict until Staff refreshes.

Successful changes continue to record the server-derived actor, timestamp, complete before/after policy snapshots, and consecutive versions in `ai_policy_events`. No second history mechanism or reason field was added.

The status card is rendered from server-loaded Operations state. The client shows only pending progress during mutation, does not flip the displayed state optimistically, refreshes the Server Component after a confirmed success, and preserves the old authoritative display on forbidden, conflict, network, rate-limit, validation, or server failure. Page-level load failures keep the existing Staff forbidden/service-unavailable states.

## Conversation fallback and continuation

Emergency Stop remains a prerequisite rather than a new execution control. A disabled policy prevents new Customer messages from producing executable fallback or continuation jobs. The worker checks Operations before generation, and final persistence checks Operations again while serializing with the Conversation and policy rows. Continuation cannot bypass these checks.

Disabling does not attempt provider cancellation outside the existing job transaction semantics. Work already represented by active fallback jobs is terminalized as documented above; finalization cannot append a Customer-visible AI message after Operations becomes ineligible. Re-enable affects only eligible future Customer work.

Conversation AI Continuation V2 remains unchanged: fresh Customer messages use normal human grace, AI-led follow-ups use the existing continuation instant, and a genuine Staff reply ends continuation. Agent prompts, tools, Groq, Provider Gateway/Registry, catalog, translation, SSE, and reducers are outside this feature.

## Automated coverage

Focused tests cover authenticated status reads, authorized disable/re-enable transitions, Sales/Viewer mutation denial for both directions, optimistic conflicts, active and disabled UI states, audited resume-mode derivation, preserved policy fields, accessible confirmation wiring, failed-mutation state retention, read-only environment override behavior, fallback suppression, worker pre-generation denial, finalization denial, active-job cancellation, disable/job-insertion serialization, and non-resurrection after re-enable.

## Migration status

No migration is required or generated. This feature reuses `ai_operation_policy`, `ai_schedule_windows`, `ai_policy_events`, and the existing Conversation fallback job lifecycle.

## Development manual acceptance

Do not mutate Development data as part of automated implementation. In a separately authorized manual run:

1. With a non-disabled Operations policy and an inactive environment override, open the localized Staff AI Operations page and confirm the card shows `AI Automation ACTIVE`.
2. Select **Disable AI**, verify the confirmation explicitly says automated fallback and continuation responses will stop, then confirm. Verify the refreshed authoritative status is disabled and the audit history contains the versioned Staff change.
3. Send an otherwise eligible Customer message and run `pnpm dev:ai-fallback`. Confirm no job is processed under the existing disabled-policy semantics.
4. Select **Enable AI**. Verify the prior non-disabled mode is restored, the authoritative status refreshes, and a new audit event is present. If the environment override is active, first confirm that the page refuses to present a UI re-enable action.
5. Send new Customer work. Confirm normal initial grace and existing continuation behavior resume, then run `pnpm dev:ai-fallback` only at the appropriate eligibility time.
6. In a second Staff session, create a stale-version race and confirm the rejected session remains on its old server-rendered state with a conflict message until refresh.

Manual browser interaction, Development database mutation, live provider execution, and real-device mobile/RTL verification are intentionally left to the user.
