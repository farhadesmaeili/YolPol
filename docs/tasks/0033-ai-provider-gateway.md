# AI Provider Gateway

## Objective

Connect the AI Provider Registry to provider adapters through a provider-neutral, internal execution service. The gateway executes configured candidates; it does not decide whether AI automation is globally permitted or whether AI should answer a Conversation.

## Architecture

- `ExecuteAiProviderRequest` consumes candidates through an application port. The production candidate source delegates to the Registry's existing `GetEligibleAiModelProfiles` use case, preserving its provider/profile and credential ordering.
- Adapters receive only YOLPOL request types, a configured model identifier, bounded settings, and an opaque credential reference. Application and domain code never import provider SDK types.
- The Groq adapter resolves the opaque credential reference inside server-only infrastructure, creates an official SDK client with `maxRetries: 0`, `logLevel: "off"`, and a bounded request timeout, and maps the response to safe metadata.
- Runtime health is persisted per provider configuration, model profile, and credential reference. This isolates a bad key/model combination without disabling unrelated targets.
- Execution attempts are returned in memory as content-free metadata. They are not persisted. Prompts and generated content are never written by this feature.

## Secret binding

The Registry continues to store opaque references. The initial production binding is:

```text
secret://ai/groq/primary -> GROQ_API_KEY_FILE or GROQ_API_KEY
```

The file variable has precedence so a Docker Secret can be mounted at `/run/secrets/groq_api_key`. Bindings are centralized in server-only composition and can be extended without placing environment-variable names or values in Registry records. Missing, unreadable, empty, and unsupported secrets produce the same safe `MISSING_SECRET` failure and never include the reference, path, variable name, or secret value in an error.

## Failure, retry, and failover policy

- `INVALID_REQUEST`, `SAFETY_REJECTION`, `CANCELLED`, and `UNKNOWN_PROVIDER_ERROR` are terminal. They are never retried or sent to another candidate and never affect circuit health. Treating an unclassified provider failure as terminal prevents provider shopping when the SDK does not expose a reliable machine-readable safety distinction.
- `RATE_LIMIT`, `TIMEOUT`, `NETWORK`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_SERVER_ERROR` receive at most one gateway retry, with bounded exponential delay. Groq SDK retries are disabled.
- `AUTHENTICATION`, `PERMISSION`, and `MISSING_SECRET` move to the next configured credential without retry.
- `MODEL_NOT_FOUND_OR_CONFIG`, `MALFORMED_RESPONSE`, and `UNSUPPORTED_ADAPTER` move to the next candidate without retry.
- After bounded retry exhaustion, availability failures may use the next credential and candidate. A rate limit moves directly to the next candidate rather than rotating keys on the same candidate. Credential failover is for rotation, credential failure, availability, and operational redundancy, never quota or policy circumvention.

Only `TIMEOUT`, `NETWORK`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_SERVER_ERROR` increment circuit failures. Rate limits, authentication/configuration failures, invalid requests, and safety rejections do not claim that the execution target is unhealthy.

## Circuit breaker

Circuits are `CLOSED`, `OPEN`, or `HALF_OPEN`. Three consecutive qualifying failures open a target for 30 seconds. After `openUntil`, one database-leased half-open probe is allowed for 15 seconds. A success closes and resets the target; a qualifying probe failure reopens it. Versioned permits make stale results no-ops, preventing an older concurrent completion from overwriting newer health state.

Migration `0016_ai_provider_gateway.sql` adds only target identity and runtime health metadata. It has no prompt, message, request body, response body, generated content, header, or secret columns.

## Execution boundaries and deferrals

- The executable message model supports `SYSTEM`, `USER`, and `ASSISTANT`; text generation and Registry-configured translation-capable profiles use the same neutral chat execution primitive.
- Structured-output requirements and tool definitions are deferred until a provider-neutral schema contract and agent orchestration are designed. No business tool executes here.
- Conversation translation, language detection, translation records, and UI belong to `feature/conversation-translation`.
- Human/AI eligibility, grace scheduling, Staff takeover, durable job idempotency, and response scheduling belong to the Human/AI Fallback Routing feature.
- Product/pricing tools, inquiry mutation, and agent behavior belong to the AI Agent feature.
- The gateway does not read AI Operations policy, mutate Conversations, call messaging providers, or expose a prompt HTTP endpoint.
