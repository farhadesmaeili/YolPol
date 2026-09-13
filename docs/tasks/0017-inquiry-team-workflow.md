# Inquiry Team Workflow Phase 1

## Decision

The Inquiry aggregate owns the provider-neutral lifecycle: `NEW`, `WAITING_FOR_TEAM`, `WAITING_FOR_CUSTOMER`, `QUOTED`, `CONFIRMED`, and `CLOSED`. Transitions are validated by the aggregate; application use cases cannot persist an arbitrary status. Repeating the current status is idempotent and does not create history.

The transition graph allows a new Inquiry to enter team handling or close, alternates between team and customer waiting states, permits quotation from either waiting state, permits confirmation only after quotation, and makes `CLOSED` terminal. A quotation may return to either waiting state before confirmation.

## Assignment

`inquiry_team_members` is independent from provider-specific communication recipients and future authentication identities. It provides a stable member reference plus active/inactive state. `inquiry_assignments` stores at most one current assignee per Inquiry. Assignment use cases reject inactive members, and the PostgreSQL repository verifies active state again in the write transaction to cover concurrent deactivation.

Passing a member reference assigns or reassigns the Inquiry. Passing `null` unassigns it. Status writes compare both the previously read status and `updated_at`; existing assignment writes compare both the previously read member reference and `assigned_at`. Mutation timestamps must advance strictly, so these timestamps act as snapshot versions and prevent ABA cycles from making stale state appear current. Initially unassigned inquiries retain conflict-safe insert semantics.

## Workflow history

`inquiry_workflow_events` is append-only through the repository contract. Creation, status changes, assignments, and unassignments record previous and new values, an optional provider-neutral actor reference, and an exact timestamp. Inquiry creation and its history event share the existing submission transaction; later workflow mutations and their history events also share one transaction.

The migration maps legacy statuses as follows: `received` to `NEW`, `processing` to `WAITING_FOR_TEAM`, `contacted` to `WAITING_FOR_CUSTOMER`, `quoted` to `QUOTED`, `won` to `CONFIRMED`, and both `lost` and `spam` to `CLOSED`. It then backfills one `NEW` creation event for every existing Inquiry without fabricating historical transition timestamps that were never stored.

## Deferred work

Admin UI, authentication, authorization policy, team-member provisioning, and channel-driven automatic status changes remain outside Phase 1. Customer Inquiry submission, chat, Telegram, SSE, localization, and their public contracts remain unchanged.
