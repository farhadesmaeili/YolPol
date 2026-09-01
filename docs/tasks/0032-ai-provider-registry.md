# AI Provider Registry

## Objective

Add a persistent, provider-neutral operational registry for future AI generation and translation infrastructure. The registry configures eligibility metadata only; it does not resolve secrets, call providers, generate content, route conversations, retry, fail over, or inspect provider health.

## Domain decisions

- Provider identity uses a stable record ID plus a validated lowercase adapter key. `groq`, `openai`, and `anthropic` are initial known examples, but the adapter key is intentionally not a closed domain enum, so adding a future provider does not require a persistence migration.
- Provider model identifiers are stored data, not enums. Model profiles own a bounded, explicit generation configuration: optional temperature, optional Top P, and maximum output tokens. Arbitrary provider request JSON is rejected.
- Capabilities are the minimum roadmap set: text generation, translation, structured output, and tool calling. Image, audio, vision, and embeddings are excluded.
- Providers, model profiles, and credential references accept duplicate priority values. Ordering is ascending priority with the stable entity ID as the explicit tie-breaker.
- Disabled records remain persisted and audited; disabling affects future configuration eligibility only.
- Eligibility requires an enabled provider, enabled profile supporting the requested capability, and at least one enabled credential reference. It does not consider live health and performs no retry or failover.

## Secret boundary

Credential records contain a safe alias and opaque `credentialReference` only. They have no raw-key, token, authorization-header, or secret-value field. The UI explicitly warns Staff to enter references only. Actual server-side secret resolution belongs to the future provider gateway/deployment feature.

## Persistence and concurrency

Migration `0015_ai_provider_registry.sql` adds:

- `ai_provider_configs`
- `ai_model_profiles`
- `ai_model_profile_capabilities`
- `ai_credential_references`
- `ai_provider_registry_events`

Each mutable entity has an optimistic version. Compare-and-swap persistence and the matching immutable audit event share one transaction. Audit events include entity type/ID, change type, safe before/after snapshots, server-derived Staff actor, timestamp, and version transition. The migration seeds no records and is not applied to Development.

## RBAC, HTTP, and UI

- Every valid Staff role may view the safe registry and audit history.
- Super Administrators and Administrators may manage providers and model profiles.
- Only Super Administrators may manage credential references.
- The grouped command API is `GET`/`POST /api/staff/ai-providers`; audit history is `GET /api/staff/ai-providers/audit`.
- Mutations use exact Origin validation, the HttpOnly Staff session, server-derived actor identity, bounded exact-shape JSON, rate limiting, domain validation, safe errors, and optimistic conflicts.
- The localized UI is `/{locale}/staff/ai-providers` for English, Turkish, Persian, and Arabic. Provider/model/reference identifiers use intentional LTR fields while page direction remains locale-driven.

## Explicit deferrals

Provider SDKs and HTTP clients, generation gateways, real model validation, secret resolution, provider calls, retry/failover, health probes, circuit breakers, failure taxonomy, product/pricing access, provider seeding, and Development migration application remain deferred to `feature/ai-provider-gateway` or later deployment work.
