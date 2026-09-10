# Environment and Secrets Hardening

## Goal and scope

This feature defines a validated, service-aware environment contract for future Dockerized Staging and Production deployments. It preserves the Deployment Environment Contract from task 0052 and does not add a Dockerfile, deployment Compose file, reverse proxy, deployment workflow, server directory, worker loop, health endpoint, schema migration, or live credential.

Configuration and secrets are deliberately distinct. Deployment identity, origins, public bot metadata, rate limits, and policy switches are configuration. Database connection strings, database passwords, Telegram credentials, and provider credentials are sensitive. All sensitive runtime values remain server-only and no secret is placed in public site configuration or a `NEXT_PUBLIC_*` variable.

## Environment inventory

| Variables | Classification | Environments | Current consumers and validation |
| --- | --- | --- | --- |
| `NODE_ENV` | Server/toolchain configuration | All | Next.js/runtime mode, secure cookie names/attributes, Development tooling guards, and deployment identity parsing. |
| `YOLPOL_DEPLOYMENT_ENVIRONMENT`, `YOLPOL_APP_ORIGIN` | Server-only configuration | Development/Test/Staging/Production; origin required only in Staging/Production | Shared deployment contract, request Origin authorization, runtime links, and indexing controls. Staging/Production fail closed on missing, inconsistent, or invalid values. |
| `YOLPOL_DEV_ORIGIN` | Server-only configuration | Development only | Exact optional LAN/device origin. Ignored outside Development and strictly normalized. |
| `DATABASE_URL` | Server-only sensitive connection configuration | Any database-backed runtime; distinct per environment | Web persistence, workers, Drizzle, provisioning, and retention. Application parsing requires a complete PostgreSQL URL and errors never include the supplied URL. |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Local Compose configuration; password is sensitive | Development only | Existing local PostgreSQL Compose service. These defaults are not a Staging or Production contract. |
| `INTEGRATION_DATABASE_URL`, `POSTGRES_TEST_PORT`, `POSTGRES_TEST_DB`, `POSTGRES_TEST_USER`, `POSTGRES_TEST_PASSWORD` | Disposable test configuration; password/URL are sensitive | Test/CI only | Guarded tmpfs PostgreSQL integration lifecycle. Production and Development database identities are rejected by the test safety boundary. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN_FILE` | Server-only secret source | Runtime/tooling when outbound Telegram is enabled | Notification worker, webhook onboarding response, and Telegram tooling. Exactly one non-empty direct or file-backed source is accepted and the token format is validated. |
| `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_SECRET_FILE` | Server-only secret source | Web webhook route; webhook registration tooling | Telegram secret-header authentication and webhook setup. Exactly one non-empty direct or file-backed source is accepted and the secret format is validated. |
| `TELEGRAM_WEBHOOK_PUBLIC_ORIGIN` | Server/tooling configuration | Environment where webhook tooling is deliberately invoked | Strict absolute HTTPS origin for webhook management only. It does not authorize inbound requests. |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Public browser-visible configuration | Web environments using Staff onboarding | Strictly validated public bot username used only to construct `t.me` links. It is the only `NEXT_PUBLIC_*` contract variable and is not a credential. |
| `GROQ_API_KEY`, `GROQ_API_KEY_FILE` | Server-only secret source | Services executing the bound Groq provider profile | Provider Gateway credential resolver for `secret://ai/groq/primary`. Exactly one direct or file-backed source is accepted. Resolution remains lazy because provider eligibility and credential references are persisted and provider-neutral. |
| `YOLPOL_AI_AUTOMATION_EMERGENCY_DISABLED` | Server-only policy configuration | Web and AI workers | Explicit boolean emergency override. Invalid values fail closed as active/invalid. |
| `INQUIRY_RATE_LIMIT_MAX_REQUESTS`, `INQUIRY_RATE_LIMIT_WINDOW_SECONDS` | Server-only configuration | Web | Public Inquiry HTTP limiter; defaults 60 requests per 600 seconds. |
| `STAFF_LOGIN_RATE_LIMIT_MAX_REQUESTS`, `STAFF_LOGIN_RATE_LIMIT_WINDOW_SECONDS` | Server-only configuration | Web | Staff login limiter; defaults 20 requests per 60 seconds. |
| `STAFF_REPLY_RATE_LIMIT_MAX_REQUESTS`, `STAFF_REPLY_RATE_LIMIT_WINDOW_SECONDS` | Server-only configuration | Web | Authenticated Staff reply/control limiter; defaults 120 requests per 60 seconds. |
| `STAFF_AI_OPERATIONS_RATE_LIMIT_MAX_REQUESTS`, `STAFF_AI_OPERATIONS_RATE_LIMIT_WINDOW_SECONDS` | Server-only configuration | Web | AI Operations mutation limiter; defaults 30 requests per 60 seconds. |
| `STAFF_AI_PROVIDER_REGISTRY_RATE_LIMIT_MAX_REQUESTS`, `STAFF_AI_PROVIDER_REGISTRY_RATE_LIMIT_WINDOW_SECONDS` | Server-only configuration | Web | Provider Registry mutation limiter; defaults 30 requests per 60 seconds. Previously consumed but undocumented in `.env.example`. |
| `CONVERSATION_TYPING_RATE_LIMIT_MAX_REQUESTS`, `CONVERSATION_TYPING_RATE_LIMIT_WINDOW_SECONDS` | Server-only configuration | Web | Customer and Staff typing limiter; defaults 120 requests per 60 seconds. Previously consumed but undocumented in `.env.example`. |
| `INQUIRY_NOTIFICATION_DEV_POLL_MS` | Server-only configuration | Development worker wrapper only | Optional interval from 500 through 60000 milliseconds; default 2000. The Development command is unavailable under `NODE_ENV=production`. |
| `CI`, `NEXT_TELEMETRY_DISABLED` | CI/toolchain configuration | CI only | GitHub Actions behavior; neither is an application secret. |

Unit-test-only synthetic variables such as `TEST_GROQ_KEY*` and `YOLPOL_ENV_LOADER_*` are fixtures and are not deployment contract entries.

## Validation and secret-file behavior

Existing domain-specific readers remain the owners of deployment origins, database URLs, public bot metadata, rate limits, Development polling, Telegram formats, and AI emergency semantics. This avoids a global configuration object that would force every process to receive every variable.

The shared server-only secret reader handles only the repeated `VALUE` / `VALUE_FILE` mechanics:

1. Blank values are treated as absent.
2. Exactly one non-empty direct value or file path is required when the consuming service composes or resolves that credential.
3. Setting both non-empty forms is rejected; neither source silently wins.
4. File content is trimmed and must be non-empty.
5. Missing, unreadable, or empty files fail with the environment variable name only. The path, file content, and underlying filesystem error are not included.

Telegram uses the synchronous reader at its existing synchronous composition boundary. Groq retains asynchronous file access through the Provider Gateway resolver. Telegram protocol, webhook verification, reply correlation, Groq transport, prompts, orchestration, retries, and model behavior are unchanged.

`DATABASE_URL_FILE` is intentionally not introduced. The URL is configuration containing a credential, is already required by Drizzle and standalone tooling, and should be constructed by deployment tooling from the environment-specific database identity. Adding a second input path would duplicate parsing across synchronous tools without improving service isolation. The future migration job should receive only its dedicated migration `DATABASE_URL`.

## Per-service contract

| Service | Required configuration | Conditional/optional configuration |
| --- | --- | --- |
| Web | `NODE_ENV`, deployment identity/origin appropriate to the environment, `DATABASE_URL` for database-backed routes | Telegram webhook secret and bot token for the webhook/onboarding response route; public bot username for onboarding links; web rate-limit overrides; AI emergency override; selected provider secret when a provider execution occurs; Development origin locally. |
| Inquiry notification worker | `NODE_ENV`, deployment identity/origin, `DATABASE_URL`, exactly one Telegram bot-token source | `INQUIRY_NOTIFICATION_DEV_POLL_MS` only for the Development wrapper. It is not part of the one-shot Production worker. |
| Conversation translation worker | `NODE_ENV`, deployment identity, `DATABASE_URL` | AI emergency override and the credential selected by an eligible provider profile, currently the Groq binding. |
| Conversation AI fallback worker | `NODE_ENV`, deployment identity, `DATABASE_URL` | AI emergency override and the credential selected by an eligible provider profile, currently the Groq binding. |
| Migration job | Dedicated migration `DATABASE_URL` only | No Telegram, provider, public web, or rate-limit configuration. |
| Telegram webhook tooling | Telegram bot-token source and `TELEGRAM_WEBHOOK_PUBLIC_ORIGIN` | Telegram webhook-secret source only for the mutating webhook-set command. |

Provider credentials are intentionally resolved only after Registry eligibility selects an opaque credential reference. Requiring every possible provider secret at process startup would break the provider-neutral contract and prevent intentionally disabled/provider-free operation. Missing selected credentials fail safely at the Gateway boundary.

## Development, Test, and CI

Local Development retains the existing `.env.local` workflow. Development wrappers load local environment files before importing runtime composition; Production-style `worker:*` commands remain process-environment-only. A developer does not need Telegram or provider credentials to run unrelated web/build/test behavior, and this feature neither reads nor changes `.env.local`.

Vitest remains deterministic with injected fake configuration. The disposable integration runner continues to own its test URL and tmpfs PostgreSQL identity. GitHub CI continues to run lint, typecheck, unit tests, disposable PostgreSQL integration tests, migration checks, and the Production build without real Telegram, provider, Staging, or Production secrets. No GitHub Secret is required and `.github/workflows/ci.yml` is unchanged.

## Staging and Production separation

Staging and Production must have separate application origins, PostgreSQL roles/databases/passwords, Telegram credentials when enabled, provider credentials when enabled, and mounted secret files. A file path or credential from one environment must never be a default for the other. Both run with `NODE_ENV=production`; the explicit deployment identity and application origin preserve the task 0052 fail-closed distinction.

Future Docker services should receive only the variables in their service contract and mount only their own secret files read-only. No complete `.env` should be passed to every container, and no secret should be copied into an image. Host/Docker secrets remain the preferred runtime store. GitHub deployment environments and secrets should be introduced only when a later deployment workflow genuinely needs them.

No server directories, credentials, Docker deployment definitions, database migrations, or deployment operations are created by this feature.
