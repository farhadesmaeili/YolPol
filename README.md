# YOLPOL

[English](README.md) | [فارسی](README.fa.md)

YOLPOL is a multilingual, SEO-first B2B wholesale sourcing platform. Its current public catalog focuses on bulk empty glass bottles and glass packaging for olive oil, food, and beverage applications. It supports `en`, `tr`, `fa`, and `ar`, with right-to-left rendering for Persian and Arabic and left-to-right rendering for English and Turkish.

Commercial activity is inquiry-only: the public site does not publish internal Product prices or provide checkout, payment, or direct online purchasing. The application is designed for self-hosting and favors static Server Components, crawlable locale-prefixed routes, and explicit operational boundaries.

The current repository and verified Production release are `v0.2.7`. The authenticated Production deployment completed successfully as `deployed-not-publicly-activated`, including the first real changed-migration-fingerprint Phase C2 transaction: the controller created a fresh backup, accepted authenticated Windows durable-write evidence and exact destination readback, then completed migration `0024_phase_c2_live_acceptance`. Production Monitoring is also accepted: the `v0.2.3` activation milestone was followed by the live `v0.2.4` Prometheus administration-proxy rollout. Final public DNS/Cloudflare cutover, independent external monitoring, restore/disposable disaster-recovery acceptance, and automatic restore/PITR remain separate work.

## Key features

- Localized Product catalog, category pages, Product detail pages, metadata, sitemap, and structured data.
- Public wholesale inquiry flow with server-side validation and PostgreSQL persistence.
- Pallet-oriented export-logistics planning based on verified packaging facts.
- Durable Customer conversations, Staff workflows, Telegram integration, and configurable notification destinations.
- Provider-configured conversation translation and policy-controlled AI fallback, with fail-closed Operations and provider controls.
- Staff authentication, team management, Telegram onboarding, and guarded provisioning tools.
- Explicit Drizzle migrations, PostgreSQL integration tests, retention tooling, backup/restore validation, and operational monitoring contracts.
- Immutable release manifests and digest-pinned Staging/Production deployment automation with explicit Production approval.

Deferred capabilities are listed in [Current limitations and roadmap](#current-limitations-and-roadmap); a directory, schema, or foundation should not be interpreted as public activation of a deferred capability.

## Technology stack

Repository-pinned or directly verified versions include:

| Technology | Version or contract |
| --- | --- |
| Next.js | `16.3.0`, App Router |
| React / React DOM | `19.2.8` |
| TypeScript | `^5`, strict mode |
| next-intl | `^4.13.6` |
| PostgreSQL | `17.6-alpine`, digest-pinned in Compose/Dockerfile |
| Drizzle ORM / Kit | `0.45.2` / `0.31.10` |
| pnpm | `11.14.0` |
| Node.js | `22` in CI and the runtime image |
| Vitest | `^4.1.10` |
| Tailwind CSS | `^4` |
| Docker / Compose | Docker Engine or Desktop with Compose v2 |

## Architecture

Task 0082 adds an optional, isolated [Customer Acquisition local foundation](deploy/customer-acquisition/README.md).
It uses synthetic data only, separate n8n/acquisition databases and an authenticated
private API. Start with `pnpm test:acquisition`; disposable PostgreSQL verification is
`pnpm test:acquisition:disposable`. Normal Development and application deployment do
not activate this stack. Real discovery and outreach remain deferred.

YOLPOL uses the Next.js App Router, Clean Architecture, and Feature-Based Architecture. Framework entry points remain thin; composition roots wire application ports to infrastructure without making App Router files depend directly on feature infrastructure.

```text
src/
├── app/                 # Thin App Router routes and framework metadata
├── composition/         # Explicit dependency composition roots
├── features/            # Business features
│   └── <feature>/
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       ├── presentation/
│       └── testing/
├── i18n/                # Locale routing, navigation, requests, messages
└── shared/              # Genuine cross-feature types, config, and UI
tooling/                 # Workers, provisioning, release, tests, operations
deploy/                  # Environment-specific deployment contracts/runbooks
drizzle/                 # Reviewed, explicit SQL migrations
docs/                    # Architecture, roadmap, tasks, deployment records
```

Dependencies flow `presentation → application → domain` and `infrastructure → application/domain`. Domain and application code remain framework-independent. Production code never imports feature testing utilities. Each business feature keeps real code in the five permanent layers; shared site-shell UI remains shared presentation code rather than an artificial business feature.

Non-localized public brand, navigation, and contact facts live in [`src/shared/config/site.ts`](src/shared/config/site.ts). User-facing labels remain in locale message files. See [the architecture guide](docs/architecture/ARCHITECTURE.md) for the full boundary and dependency rules.

## Internationalization

All public locales use mandatory prefixes:

| Locale | Language | Direction |
| --- | --- | --- |
| `en` | English | LTR |
| `tr` | Turkish | LTR |
| `fa` | Persian | RTL |
| `ar` | Arabic | RTL |

`src/i18n/routing.ts`, `navigation.ts`, `request.ts`, and the four JSON message catalogs define the next-intl boundary. The localized root layout validates the locale and sets `lang` and `dir`. Commands, identifiers, Product facts, and interface translations remain separate concerns.

## Prerequisites

- Git.
- Node.js 22, matching CI and the pinned container runtime. The package does not currently declare a separate `engines.node` range.
- Corepack with `pnpm 11.14.0` (the version in `package.json`).
- Docker Engine or Docker Desktop with Docker Compose v2.
- Sufficient local ports, normally `3000` for Next.js, `5432` for Development PostgreSQL, and `55432` for disposable integration PostgreSQL.

Local PostgreSQL is normally supplied by Docker Compose; a separate host installation is not required.

## Clone and install

```powershell
git clone https://github.com/farhadesmaeili/YolPol.git
cd YolPol
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install
```

## Environment configuration

Create the ignored Development environment file:

```powershell
Copy-Item .env.example .env.local
```

`.env.local` is for local Development only. Staging and Production run with `NODE_ENV=production` and receive reviewed non-secret runtime configuration plus secrets through the process environment, Docker Secrets, or fixed host secret files. They do not read the developer's `.env.local`.

Never commit passwords, database URLs, bot tokens, webhook secrets, provider keys, private keys, or real host credentials. Replace every example credential before use.

The variables in [`.env.example`](.env.example) are grouped by responsibility:

- deployment identity and public runtime origin;
- structured logging identity and level;
- local PostgreSQL and `DATABASE_URL`;
- public Telegram bot metadata and server-only bot/webhook credentials;
- provider-neutral AI controls and Groq credential input;
- long-running worker polling intervals;
- process-local rate limits;
- Development-only LAN and worker settings;
- isolated integration-test PostgreSQL settings.

Secret pairs such as `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_TOKEN_FILE` and `GROQ_API_KEY` / `GROQ_API_KEY_FILE` are mutually exclusive where implemented; configure exactly one supported source. Do not copy Development credentials into Staging or Production.

## Local PostgreSQL and migrations

Start the persistent Development database and check its status:

```powershell
docker compose up -d postgres
docker compose ps
```

`DATABASE_URL` must be a complete PostgreSQL URL for the intended database. Drizzle commands load the local Development environment when the process has not already supplied the value.

```powershell
pnpm db:check
pnpm db:migrate
pnpm db:studio
```

Use `pnpm db:generate` only after an intentional schema change. Review the generated SQL and schema contract before it is accepted. Migrations are committed, explicit release artifacts; application and worker startup never runs them. Do not use an unsafe runtime schema push for Production.

The Development service uses the `postgres_data` named volume. The integration service is separate, profile-gated, bound to loopback, and uses `tmpfs`; never point integration tests or cleanup at Development, Staging, or Production data.

## Development

Run the local application with `pnpm dev`. For LAN/mobile testing, use `pnpm dev:host`, which binds the Development server to `0.0.0.0`. Set the optional Development-only `YOLPOL_DEV_ORIGIN` to the single approved LAN origin when testing from another device; do not configure it in Staging or Production.

## Development workers

The Next.js Development server does not start background workers. Run each needed worker in a separate terminal; Development wrappers load the local environment before importing production composition.

```powershell
# Terminal 1
pnpm dev

# Terminal 2
pnpm dev:inquiry-notifications

# Terminal 3
pnpm dev:conversation-translation

# Terminal 4
pnpm dev:ai-fallback
```

- `dev:inquiry-notifications` processes durable inquiry notification work and retries.
- `dev:conversation-translation` processes queued conversation translation work.
- `dev:ai-fallback` processes eligible, policy-controlled conversation AI fallback work.

Workers fail safely when required database, provider, deployment, or policy configuration is unavailable. Provider credentials are server-only.

## Production worker commands

| Command | Behavior |
| --- | --- |
| `pnpm worker:inquiry-notifications` | Long-running inquiry notification polling worker. |
| `pnpm worker:inquiry-notifications:once` | Processes one bounded batch, then exits. |
| `pnpm worker:conversation-translation` | Long-running conversation translation worker. |
| `pnpm worker:conversation-translation:once` | Processes one bounded translation batch, then exits. |
| `pnpm worker:ai-fallback` | Long-running conversation AI fallback worker. |
| `pnpm worker:ai-fallback:once` | Processes one bounded AI fallback batch, then exits. |

Production commands are environment-only and do not load `.env.local`. The deployed Compose contracts manage the normal live worker lifecycle; operators should not bypass those contracts by manually starting ad hoc Production processes. `:once` commands exist for controlled diagnostics or explicitly managed one-shot execution.

## Staff and Super Admin provisioning

Both tools require a real interactive TTY, accept no command-line arguments, and need database access through `DATABASE_URL`. Password input is hidden and is never printed. Run them only from a trusted operator terminal or the fixed deployment operation intended for the target environment—not during install, build, migration, application startup, or CI.

```powershell
pnpm staff:provision
```

This command asks for a Team Member ID, display name, login email, role, password/confirmation, and final confirmation. Although the domain role set is `SUPER_ADMIN`, `ADMIN`, `SALES`, and `VIEWER`, direct provisioning deliberately accepts only `ADMIN` or `SALES`. It validates the Team Member and account invariants, hashes the password with the existing security adapter, and fails closed on conflicts or dependency/persistence errors.

```powershell
pnpm staff:bootstrap-super-admin
```

This one-time bootstrap asks for an existing Staff Account ID and promotes only an active `ADMIN` linked to an active Team Member. It refuses a second bootstrap when a `SUPER_ADMIN` already exists. It does not create a new account and does not accept credentials as arguments.

Production Staff operations use the immutable worker image through the restricted, interactive deployment wrapper. They require real stdin/stdout/stderr TTYs and do not grant the operator arbitrary Docker or root access. See [deployment operations](deploy/operations/README.md) for the authoritative live procedure.

## Telegram tooling

```powershell
pnpm telegram:webhook:set
pnpm telegram:webhook:info
```

`telegram:webhook:set` registers the fixed `/api/webhooks/telegram` HTTPS endpoint, preserves pending updates, and requires the bot token, webhook secret, and `TELEGRAM_WEBHOOK_PUBLIC_ORIGIN`. `telegram:webhook:info` compares Telegram's registered URL with the expected URL and requires the bot token and public origin; diagnostic output redacts sensitive or unsafe provider data.

The public origin must be an absolute HTTPS origin without credentials, path, query, or fragment. The commands accept no positional arguments. In Development they may load ignored local environment files; live credentials must come from the reviewed Production secret contract. Running these commands contacts Telegram and changes or inspects provider state, so use them only in the intended environment.

## Inquiry retention

`pnpm retention:inquiries` requires `DATABASE_URL` and deletes Inquiry roots strictly older than the UTC 24-month cutoff; dependent Product snapshot rows follow the database foreign-key cascade. It is a destructive, controlled one-shot operation and is not run during rendering, submission, migration, or worker startup.

The command existing does not mean a schedule is active. Production scheduling and failure alerting remain an explicit operational responsibility; consult the relevant privacy/operations records before activating or changing a schedule.

## Testing and quality

| Command | What it validates | Docker required? |
| --- | --- | --- |
| `pnpm lint` | ESLint rules for the repository. | No |
| `pnpm typecheck` | Strict TypeScript checking without emit. | No |
| `pnpm test` | Main Vitest unit/component/contract suite. | No |
| `pnpm build` | Next.js Production build and framework integration. | No |
| `pnpm test:integration` | Guarded PostgreSQL integration suite using only `postgres-test`. | Yes |
| `pnpm test:backup-restore` | Builds the `operations-test` image and runs shell-level backup/restore tests. | Yes |
| `pnpm test:backup-restore:disposable` | End-to-end disposable PostgreSQL, encrypted backup, verification, restore, and negative tests. | Yes |
| `pnpm test:monitoring` | Vitest monitoring contract and Operations Metrics tests. | No |
| `pnpm test:monitoring:disposable` | Disposable monitoring stack against synthetic PostgreSQL and health endpoints. | Yes |
| `pnpm test:deployment` | Deployment/Compose policy tests; full resolved-model coverage needs Compose. | Compose for full coverage |
| `pnpm test:control-plane` | Python control-plane tests plus release-deployment Vitest coverage. | No |
| `pnpm test:deployment:disposable` | Isolated Linux wrapper/bootstrap/security validation. | Yes |
| `pnpm test:bootstrap` | Server-bootstrap contract tests. | No |
| `pnpm test:release` | Release manifest, workflow, and security contract tests. | No |

Disposable commands create only purpose-specific containers, networks, images, or temporary storage described by their harness. Do not replace them with broad `docker compose down -v` operations or point them at persistent environments.

## Script reference

Every current `package.json` script is listed below.

| Command | Purpose | Typical context |
| --- | --- | --- |
| `pnpm dev` | Start the local Next.js Development server. | Local app work |
| `pnpm dev:host` | Start Development on `0.0.0.0`. | LAN/mobile testing |
| `pnpm build` | Create the Production Next.js build. | CI/release verification |
| `pnpm start` | Start an already-built Next.js server. | Local Production-mode check |
| `pnpm lint` | Run ESLint. | Quality gate |
| `pnpm typecheck` | Run `tsc --noEmit`. | Quality gate |
| `pnpm test` | Run the main Vitest suite once. | Quality gate |
| `pnpm test:integration` | Run guarded disposable PostgreSQL integration tests. | Docker-backed validation |
| `pnpm test:backup-restore` | Run the backup/restore image test target. | Docker-backed operations test |
| `pnpm test:backup-restore:disposable` | Exercise disposable encrypted backup/restore behavior. | Deep Docker validation |
| `pnpm test:monitoring` | Run monitoring unit/contract tests. | Monitoring development |
| `pnpm test:monitoring:disposable` | Exercise the disposable monitoring stack. | Deep Docker validation |
| `pnpm test:deployment` | Run deployment and Compose-policy tests. | Deployment development |
| `pnpm test:control-plane` | Run Python and TypeScript control-plane tests. | Deployment security gate |
| `pnpm test:deployment:disposable` | Exercise the restricted Linux deployment surface. | Deep Docker validation |
| `pnpm test:bootstrap` | Run bootstrap contract tests. | Bootstrap development |
| `pnpm test:release` | Run release contract/workflow tests. | Release development |
| `pnpm db:generate` | Generate SQL from intentional Drizzle schema changes. | Schema development only |
| `pnpm db:migrate` | Apply committed migrations to the selected database. | Explicit migration step |
| `pnpm db:check` | Check Drizzle migration consistency. | Before migration/review |
| `pnpm db:studio` | Open Drizzle Studio for the selected database. | Controlled Development inspection |
| `pnpm retention:inquiries` | Delete inquiries older than the 24-month cutoff. | Controlled database operation |
| `pnpm staff:provision` | Interactively provision an `ADMIN` or `SALES` account. | Trusted TTY |
| `pnpm staff:bootstrap-super-admin` | One-time promotion of an eligible `ADMIN`. | Trusted TTY/bootstrap |
| `pnpm dev:inquiry-notifications` | Run the Development inquiry notification worker. | Separate local terminal |
| `pnpm dev:conversation-translation` | Run the Development translation worker. | Separate local terminal |
| `pnpm dev:ai-fallback` | Run the Development AI fallback worker. | Separate local terminal |
| `pnpm worker:inquiry-notifications` | Run continuous Production-style notification polling. | Managed runtime |
| `pnpm worker:inquiry-notifications:once` | Process one notification batch. | Controlled one-shot |
| `pnpm worker:conversation-translation` | Run continuous Production-style translation polling. | Managed runtime |
| `pnpm worker:conversation-translation:once` | Process one translation batch. | Controlled one-shot |
| `pnpm worker:ai-fallback` | Run continuous Production-style AI fallback polling. | Managed runtime |
| `pnpm worker:ai-fallback:once` | Process one AI fallback batch. | Controlled one-shot |
| `pnpm telegram:webhook:set` | Register the fixed Telegram webhook. | Controlled provider operation |
| `pnpm telegram:webhook:info` | Inspect and compare Telegram webhook state. | Controlled provider diagnostic |
| `pnpm release:validate-tag` | Validate the SemVer release tag contract. | Release preparation |
| `pnpm release:migration-fingerprint` | Calculate the committed migration-set fingerprint. | Manifest/release preparation |
| `pnpm release:manifest:generate` | Generate a strict release manifest from approved inputs. | Release workflow |
| `pnpm release:manifest:validate` | Validate manifest schema and repository rules. | Release verification |
| `pnpm release:manifest:checksum` | Calculate the manifest checksum. | Release artifact creation |
| `pnpm release:manifest:verify` | Verify a manifest/checksum pair. | Promotion/authentication gate |
| `pnpm release:rollback:plan` | Compare manifests and emit a rollback compatibility plan. | Reviewed rollback planning |

## Release tooling

The release CLI implements a strict, repository-owned artifact contract. A release manifest binds the version/tag, full Git SHA, source repository, platform, migration fingerprint, and all five image roles to immutable `repository@sha256:digest` references. Its checksum detects corruption; authentication still depends on selecting the trusted GitHub Release and exact source identity through the reviewed control plane.

Promotion follows `BUILD ONCE → IDENTIFY BY DIGEST → TEST IN STAGING → APPROVE → PROMOTE THE SAME DIGEST TO PRODUCTION`. Production never rebuilds the Staging-tested source or substitutes a mutable tag. The rollback planner only emits a compatibility plan; it does not invoke Docker, PostgreSQL, migrations, restore, or network operations.

See [Release and Rollback Operations](deploy/release/README.md) for arguments, manifest fields, promotion gates, and rollback handling.

## Deployment overview

```text
GitHub Release
→ authenticated manifest, tag, commit, and OIDC validation
→ automatic Staging deployment
→ health, readiness, and smoke validation
→ explicit approved Production promotion
→ exact immutable Production deployment without rebuilding
```

Release `v0.2.2` at commit `48a566142bd0259c596314f6a01a92cc66d868ce` remains the historical milestone that first exercised the authenticated Staging-to-Production runtime path and established a provisioned, healthy Production runtime. The current verified Production release is `v0.2.7` at Git SHA `ebf1988e1b7e6fbc4615fd946652f8147e34af6f`; its authenticated deployment completed successfully without public activation. Runtime deployment remains separate from public DNS/Cloudflare activation, and the final public cutover is not recorded as complete.

The environments have independent databases, volumes, credentials, runtime files, release authorities, Telegram/provider configuration, and deployment state. Root owns release authority, secrets, policy, locks, journals, and the restricted wrapper. The normal operator receives neither unrestricted Docker access nor a general root shell.

Known operational gates remain fail closed:

- The installed Phase C2 Windows helper, LocalSystem schedule, authenticated RSA-PSS receipt path, configured VPS adapter, exact durable-store readback, and deployment-bound controller evidence completed the real `v0.2.7` changed-fingerprint transaction. The committed repository default remains unconfigured and fail-closed.
- Every future changed Production fingerprint still requires a fresh controller-created backup and exact deployment-bound durability evidence; missing or invalid evidence remains rejected with `PHASE_C2_OFFSERVER_BACKUP_REQUIRED` before authority mutation.
- Production Monitoring and the hardened Prometheus administration proxy are live-accepted. Public DNS/TLS monitoring and an independent off-host watchdog remain separate.
- No automatic restore exists.
- Disposable rebuild and full disaster-recovery proof remain incomplete.
- Final public DNS/Cloudflare cutover remains separately reviewed and controlled.

Start with the [bootstrap](deploy/bootstrap/README.md), [control-plane](deploy/control-plane/README.md), [operations](deploy/operations/README.md), [Production](deploy/production/README.md), and [monitoring](deploy/monitoring/README.md) runbooks. They are authoritative for sensitive or destructive procedures.

## Branch and contribution workflow

```text
develop
→ dedicated feature/fix/docs branch
→ reviewed pull request back to develop
→ release preparation
→ reviewed develop → main pull request
→ version tag and GitHub Release
→ post-release ancestry sync when required
```

Use a dedicated branch for every feature, fix, or documentation task. Do not work directly on `main`. Inspect the branch, HEAD, and worktree before changing files. Commits, pushes, tags, and promotions must be deliberate and reviewed. This describes the project workflow; it does not claim unverified GitHub branch-protection settings.

## Security boundaries

- Never store secrets in Git, images, manifests, command arguments, logs, or public client bundles.
- Supply live secrets only through reviewed process environment, Docker Secrets, or root-controlled host secret files.
- Keep Development, integration, Staging, Production, Monitoring, and future service credentials distinct.
- Never expose PostgreSQL port `5432` to the public Internet; application database traffic stays on private networks.
- Preserve the inquiry-only sales model and never expose internal Product prices on the public site.
- Treat trusted release paths, manifests, runtime contracts, journals, and deployment policy as root-controlled authority.
- Deploy first-party runtime images only by immutable digest.
- Do not grant the normal operator unrestricted Docker, Compose, shell, systemd, database-administration, or root access.
- Do not bypass `PHASE_C2_OFFSERVER_BACKUP_REQUIRED`, migration review, backup verification, or approval gates.
- Do not infer public activation from a healthy Production container or a successful Production deployment.

## Project documentation

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Roadmap](docs/roadmap/ROADMAP.md)
- [Server bootstrap](deploy/bootstrap/README.md)
- [Authenticated deployment control plane](deploy/control-plane/README.md)
- [Deployment operations](deploy/operations/README.md)
- [Release and rollback](deploy/release/README.md)
- [Staging operations](deploy/staging/README.md)
- [Production operations](deploy/production/README.md)
- [Monitoring](deploy/monitoring/README.md)
- [Verified deployment records](docs/deployments/)

Top-level documentation is for onboarding and orientation. Follow the dedicated runbooks for live, destructive, credential-bearing, or root-controlled operations.

## Troubleshooting

### PostgreSQL is not available

Run `docker compose ps`, then start only the Development service with `docker compose up -d postgres`. Wait for its health check. Do not use broad volume-removal commands as a troubleshooting shortcut.

### `DATABASE_URL` is missing or invalid

Confirm `.env.local` exists for Development and contains a complete PostgreSQL URL with protocol, host, user, password, and database name. Confirm the command is targeting the intended environment. Never paste a live URL into source, issue output, or shell history.

### Migration checks fail

Run `pnpm db:check`, inspect the committed Drizzle schema and SQL files, and resolve the mismatch intentionally. Do not use schema push, delete migration history, or regenerate unrelated migrations to force a pass.

### A port is already in use

Check which process or container owns `3000`, `5432`, or `55432`. Stop only the conflicting Development/disposable process, or adjust the supported local variable where the repository exposes one. Do not change live deployment ports to solve a local conflict.

### Integration or disposable tests cannot use Docker

Confirm Docker is running and `docker compose version` succeeds. Integration tests use a lifecycle lock and a fixed isolated port; run only one integration suite at a time. Inspect the failing harness before removing any container, network, image, or volume.

### A worker reports missing provider configuration

Confirm the database, deployment environment, and required Telegram/Groq secret source are present for that worker. Development wrappers load local env files; Production-style commands do not. Missing or invalid provider configuration intentionally fails closed.

### Build or type checking fails

Use Node.js 22 and pnpm `11.14.0`, run `pnpm install` with the committed lockfile, then run the smallest failing command directly. Fix the underlying type, lint, test, or framework error rather than suppressing it.

## Current limitations and roadmap

The current verified remaining work includes:

- independent external failure detection, including public DNS/TLS monitoring after cutover;
- final reviewed public DNS/Cloudflare cutover;
- disposable rebuild and full disaster-recovery proof;
- multilingual content review;
- accessibility, performance, SEO, and end-to-end validation;
- distributed abuse controls, cross-client inquiry idempotency, and other items explicitly deferred by the roadmap;
- public Product persistence, payments, a CMS, an administrative catalog/dashboard, and customer-acquisition automation.

Privacy-conscious GA4 support is implemented as a Production-only runtime feature. It remains off until the visitor explicitly accepts optional analytics, and Staging, Development, and Test never load the Google script or transmit analytics events. See the [roadmap](docs/roadmap/ROADMAP.md) for the active boundary and remaining work.
