# Conversation AI Agent

## Scope

This feature upgrades the existing human-first Conversation AI fallback responder to a bounded, provider-neutral, tool-using Agent. It does not change when fallback starts, write intermediate Conversation messages, add another worker, or bypass the existing final atomic race check.

The channel-neutral input remains a bounded Conversation message context plus the authoritative Customer locale. Website fallback continues through `dev:ai-fallback` and `worker:ai-fallback`; future channels can reuse the Agent without passing an HTTP request object.

## Architecture

The AI Provider Gateway now supports optional provider-neutral function definitions, assistant tool calls, and tool-result messages. Ordinary `TEXT_GENERATION` and `TRANSLATION` requests remain compatible. Agent requests explicitly require both `TOOL_CALLING` and `TEXT_GENERATION`; Registry candidate selection filters out profiles missing either capability. Groq wire types and mappings remain isolated in the Groq adapter.

The Agent feature has domain policy and decision types, application orchestration and ports, infrastructure adapters for Product and approved knowledge sources, a small Staff escalation presentation component, and testing fakes. The approved-knowledge port can later be implemented by a `PostgresConversationAgentKnowledgeRepository` that returns Published articles without changing the orchestrator. A future Staff Knowledge feature may manage title, locale, content, Draft/Published status, updater, and timestamps; it is not implemented here.

## Code-owned safe tools

The static Registry contains only:

- `search_products`
- `get_product_details` (including packaging, so a redundant packaging tool is intentionally omitted)
- `get_public_site_information`
- `get_inquiry_process`
- `get_pickup_process`
- `request_staff_review`

Tool definitions and strict argument schemas are server-owned. Model arguments are treated as untrusted JSON and validated again before dispatch. There is no SQL, shell, filesystem, URL-fetching, generic HTTP, pricing, quotation, payment, messaging, or mutation tool. A future setting may disable one of the listed safe tools, but cannot enable a capability absent from code.

Validated arguments are normalized before repeated-call comparison (sorted keys, normalized search/SKU strings and parsed numeric values). Current tools accept flat scalar objects only, so nested objects and arrays are rejected. Model arguments cannot override the authoritative locale. Tool-call IDs are correlated across the Gateway conversation and duplicate or inconsistent IDs fail closed.

## Final-answer grounding protocol

A successful tool call alone is not permission to deliver model prose. Each tool supplies explicit server-rendered factual fragments. The Agent assigns an execution-local observation ID and retains a map of issued fact IDs and their exact localized text. The model's final output must be a bounded JSON selection plan:

```json
{"type":"GROUNDED","facts":[{"observationId":"observation_1","factId":"product_1.unitsPerPallet"}]}
```

The server accepts only issued references, no added keys or text, and renders 1 to 12 selected fragments itself. A Product fragment includes its canonical identity/SKU so quantities cannot be attributed to a different Product. All numeric values, SKU, units, labels, and public policies come from trusted data and localized server copy. A pickup/inquiry policy is an indivisible fragment so a qualifier cannot be selectively omitted. Unknown references, invented values, arbitrary final prose, missing requested fields, and conflicting observations of the same canonical fact escalate safely. No raw model final text reaches Customer persistence. Observation IDs and tool transcripts remain in memory only.

Social-only greetings/thanks receive a deterministic localized response without provider execution. Sensitive commercial requests receive the existing typed escalation. Grounded responses explicitly state that details absent from the selected facts require Staff confirmation. The protocol guarantees factual provenance and unchanged values; it cannot guarantee that the model selects every relevant fact or that a future publisher supplies correct knowledge. Approved knowledge publication and relevance evaluation remain separate responsibilities. It makes no claim to interpret arbitrary contradictions between unrelated prose articles.

## Data and security boundaries

Product tools use the existing Product repository and `ListProducts` application use case with `published` status, with an additional publication check at projection time. They map every specification and packaging field explicitly to an allow-list. Unexpected runtime source properties are discarded. The projection contains no `pricing` property. Draft and archived Products never reach the projection.

Packaging quantities come from trusted Product data. Units per reference load are calculated server-side as canonical units per pallet multiplied by Export Logistics' 26-pallet reference policy, with safe-integer validation. The result is a planning reference, not a freight or delivery commitment.

Public identity and contact values come from `src/shared/config/site.ts`. Localized inquiry-only and buyer-arranged pickup facts come from `src/shared/config/public-business-policy.ts` through `ConversationAgentKnowledgeRepository`. YOLPOL is described as a B2B wholesale supplier, not a freight/logistics provider. Mutable Product or business facts are not embedded in the Agent prompt.

Internal unit prices, supplier/purchase costs, margins, markup, private prices, hidden quotations, secrets, and Staff-only data are structurally absent from Agent tool results. Pricing, discounts, payment/credit terms, contracts, guarantees, unsupported availability/delivery claims, missing facts, contradictory data, unsupported requests, and low-confidence decisions result in typed `ESCALATE` decisions and a localized safe Customer response. No SLA is promised.

## Execution bounds and races

- recent context: at most 12 non-SYSTEM messages and 12,000 characters
- model turns: at most 4
- total tool calls: at most 6
- provider turn timeout: at most 15 seconds and never beyond the shared absolute deadline
- Agent execution ceiling: 45 seconds
- fallback lease: 60 seconds
- database finalization reserve: 5 seconds

The Agent passes one absolute cancellation deadline through every Gateway turn and tool execution. Each entire Gateway turn, including its retries, is bounded by the smaller of 15 seconds and the remaining Agent budget. Provider, tool, approved-knowledge and escalation-copy awaits are covered by the shared deadline even if a dependency ignores its signal. Late read-only results are discarded and cannot trigger another model call or message. An exhausted deadline fails the job with content-free `TIMEOUT` metadata so finalization does not need another unbounded knowledge read. Static repositories have no underlying I/O to cancel; a future database knowledge adapter should propagate cancellation to its query mechanism. The Gateway continues to own retries, candidate failover, credential rotation, and circuit behavior; the Agent adds no retry loop.

Only the existing fallback finalizer writes the final `AI_AGENT` Conversation message. Staff replies, `PAUSED`, `HUMAN_TAKEOVER`, a newer Customer message, AI Operations policy changes, and the Environment emergency override are rechecked by existing routing/persistence logic before commit.

## Translation and locale

Website Customer locale comes from existing authoritative Conversation language persistence; no AI language detection is added. The Agent authors directly in `en`, `tr`, `fa`, or `ar`. Existing Conversation Translation remains responsible for Staff-side accessibility and Customer projection behavior. Translation AUTO/MANUAL controls are out of scope.

## Persistence and Staff visibility

Migration `0019_conversation_ai_agent_escalations.sql` adds only `agent_decision` and `escalation_reason` to the existing response job. It backfills historical successful jobs as `RESPOND` before requiring non-null `RESPOND`/`ESCALATE` decisions on successful rows. Other statuses require a null decision. An escalation requires a server-owned reason; all other rows require a null reason. Checks explicitly account for PostgreSQL NULL semantics. No Customer content, transcript, prompt, tool argument/result, provider payload, or reasoning is stored merely for escalation. Staff sees a localized escalation indicator; internal reason codes are not rendered.

## Operational configuration and controlled live test

No Provider Registry record is changed by this implementation. Before a live Agent test, an enabled model profile intended for customer chat must explicitly contain both `TEXT_GENERATION` and `TOOL_CALLING`, have an enabled provider and credential reference, and use an adapter/model that supports function calling. A Translation-only or text-only profile is ineligible.

In a separately authorized target environment: apply migration `0019`, configure the selected profile through the protected Provider Registry, confirm AI Operations fallback policy and the emergency override, submit a Website inquiry message in a supported locale, wait for the human grace period, execute the existing fallback worker once, then verify the final Customer/Staff projections and routing metadata. This implementation performed no live provider call and did not apply the migration to Development.

## Deferred work

The full Agent Knowledge Admin feature, database knowledge articles, per-system safe-tool toggles, Conversation Channel Foundation, new channels, CRM, outreach, follow-up automation, pricing/quotation engines, and general web browsing remain separate features.
