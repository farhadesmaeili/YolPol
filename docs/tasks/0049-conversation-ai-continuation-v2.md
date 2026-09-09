# Conversation AI Continuation V2

## Scope

This feature changes only when an existing Conversation AI fallback job becomes eligible. It does not change Conversation Agent reasoning, prompts, tools, facts, answer protocols, response copy, escalation semantics, translation, Customer projections, SSE, UI, Groq, the Provider Gateway, the Provider Registry, model capabilities, or commercial safety rules.

An earlier experimental worktree was abandoned because it combined continuation scheduling with broad Agent and provider behavior changes. That experiment is not repository history and none of its unrelated changes are included here.

## Eligibility derivation

`PlanAiOperationsFallback` reads the existing persisted global AI Operations policy once and derives two policy-valid instants from the same Customer-message time:

- `notBefore`: the normal configured human grace deadline, adjusted to the next allowed schedule window.
- `continuationNotBefore`: the Customer-message time, adjusted only to the next allowed schedule window.

No grace constant or policy is duplicated. Disabled, emergency-disabled, missing, invalid, unavailable, or out-of-horizon policy state remains fail-closed. The two instants exist only in the transient persistence plan; the selected instant is stored in the existing non-null `conversation_ai_response_jobs.not_before` column. No schema change or migration is required.

The Customer-message transaction locks the Conversation and derives continuation from durable authored history before inserting its job. Continuation is active only when the latest earlier responder among `INTERNAL_USER` and `AI_AGENT` messages is an `AI_AGENT` message whose deterministic identity correlates to a `SUCCEEDED` fallback job in the same Conversation with an earlier trigger position. The current pending job, failed or superseded jobs, uncorrelated or stale AI-shaped messages, older AI replies before Staff takeover, Customer messages, System messages, translation records, delivery records, and metadata cannot establish or terminate ownership.

## Lifecycle and race guarantees

A fresh Conversation, including Inquiry Additional Details persisted as the `<inquiryId>-initial` Customer message, uses `notBefore` and therefore receives the normal configured human grace period. After a legitimate AI fallback response is atomically inserted and its durable job becomes `SUCCEEDED`, later Customer turns use `continuationNotBefore` while AI remains the latest genuine responder.

A genuine Customer-facing Staff reply is an `INTERNAL_USER` authored Conversation message. It ends continuation by becoming the latest responder and continues to cancel earlier pending or running jobs through the existing transaction. Read, typing, navigation, control, translation, System, delivery, and metadata actions do not count as Staff takeover.

The existing hardened path remains authoritative: Customer, Staff, and AI finalization serialize on the Conversation row; newer Customer turns supersede pending or running older jobs; prepare and finalization recheck trigger identity, position, control state, Staff replies, newer Customer messages, Operations eligibility, lease ownership, and lease expiry; and AI message insertion plus successful job completion is atomic. Stable trigger uniqueness and deterministic AI response identities prevent repeated worker runs from producing duplicate Customer-visible responses. AI messages do not schedule AI jobs.

## Automated coverage

Focused deterministic tests cover normal initial grace, pre-deadline ineligibility, post-deadline eligibility, successful activation, immediate successive continuation, Customer-burst superseding, Staff takeover and delayed re-entry, failed and superseded non-activation, historical Staff precedence, System and translation non-effects, uncorrelated AI messages, stable identities, repeated claims, existing Staff/AI races, and Inquiry Additional Details persistence. All times are injected or fixed; tests do not sleep.

## Development acceptance

Response quality is out of scope. Use a fresh Development Inquiry/Conversation and validate scheduling only.

### Phase A - initial entry

Create a fresh Inquiry/Conversation. Send the first Customer message or provide Initial Additional Details.

Immediately run:

```bash
pnpm dev:ai-fallback
```

Expected: `claimed: 0`.

After the configured human grace period, run the command again. Expected: `claimed: 1`, `succeeded: 1`, `failed: 0`.

### Phase B - continuation

Send another Customer message and immediately run `pnpm dev:ai-fallback`. Expected: `claimed: 1`; no new human grace period is applied.

### Phase C - continued continuation

Send another Customer message and immediately run the worker. Expected: the new turn is immediately eligible again.

### Phase D - human takeover

Send a genuine Customer-facing Staff reply, then send another Customer message. Immediately run `pnpm dev:ai-fallback`. Expected: `claimed: 0`. If Staff does not answer again, run after the configured human grace period; AI may then be claimed again.

Do not diagnose or change Agent/provider response quality as part of this acceptance flow. Record tool errors, unnatural answers, or other response-quality issues separately.
