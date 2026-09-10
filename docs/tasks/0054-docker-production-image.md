# Docker Production Image

## Goal and scope

This feature packages the YOLPOL Next.js web application as a deterministic, multi-stage, non-root production image. It preserves the CI Validation Foundation, Deployment Environment Contract, and Environment and Secrets Hardening contracts. It does not add deployment Compose services, a reverse proxy, image publishing, deployment automation, a database migration, a migration job, worker loops, or observability endpoints.

The existing `compose.yaml` remains Development and disposable-integration PostgreSQL infrastructure only. Normal Windows Development continues to use `pnpm dev` and does not require Docker.

## Image architecture

The Dockerfile has four explicit stages:

1. `base` uses the official multi-platform `node:22-bookworm-slim` image pinned to OCI index digest `sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5`.
2. `dependencies` activates the repository-pinned pnpm `11.14.0` through Corepack and runs `pnpm install --frozen-lockfile` with a BuildKit package-store cache that is not copied into the image.
3. `build` copies the constrained build context and runs `pnpm build` with the complete development dependency graph available.
4. `runtime` starts again from `base` and receives only `public`, `.next/standalone`, and `.next/static`. It does not receive the source tree, pnpm store, full `node_modules`, build toolchain, tests, documentation, environment files, Drizzle migrations, or worker entrypoints.

Debian Bookworm slim is preferred over Alpine for the current application because Next.js includes platform-specific SWC and Sharp dependencies. The glibc-based image avoids introducing a musl compatibility boundary for a marginal size optimization. No operating-system package is installed in the final image. BuildKit caches Corepack and pnpm downloads outside image layers; the frozen lockfile remains mandatory.

## Next.js standalone runtime

`next.config.ts` enables `output: "standalone"`. Next.js 16.3.0 traces the runtime dependency graph into `.next/standalone` and generates its minimal `server.js`. The static product data and locale messages are source imports that are compiled or traced; application runtime code does not read them from the source tree.

The only intentional runtime filesystem reads outside the image are optional secret-file paths explicitly supplied through the existing `TELEGRAM_BOT_TOKEN_FILE`, `TELEGRAM_WEBHOOK_SECRET_FILE`, or `GROQ_API_KEY_FILE` contracts. Deployment must mount each selected secret file read-only with permissions readable by the application user. The web image intentionally excludes migrations; a future one-shot migration image/job must package the migrations and receive only its dedicated `DATABASE_URL`.

The web process runs directly as PID 1:

```text
node server.js
```

Direct Node execution preserves Next.js signal handling without a shell entrypoint or process supervisor. The server defaults to port `3000` and binds to `0.0.0.0` through runtime `PORT` and `HOSTNAME` environment variables. `EXPOSE 3000` documents the container port but does not publish it.

## Runtime identity and filesystem

The runtime defines the dedicated `nextjs:nodejs` account with numeric UID/GID `1001:1001` and switches to that identity before startup. Application artifacts remain root-owned and read-only to the process. Only `.next/cache` is assigned to the application account for Next.js runtime image/cache behavior; `/tmp` retains the base image's standard temporary-file permissions. No broad permission grant or privileged capability is added.

## Configuration, secrets, and immutable promotion

The image build requires no real database URL, Telegram credential, Groq credential, Staging credential, or Production credential. `.dockerignore` excludes every `.env*` file and other local/generated material from the build context. No environment or secret file is copied into any image stage.

One built image can serve Staging and Production. Runtime injection selects the operational identity:

```text
# Staging
YOLPOL_DEPLOYMENT_ENVIRONMENT=staging
YOLPOL_APP_ORIGIN=https://staging.yolpol.com

# Production
YOLPOL_DEPLOYMENT_ENVIRONMENT=production
YOLPOL_APP_ORIGIN=https://yolpol.com
```

Both run with the image-defined `NODE_ENV=production`. The canonical public identity remains the source-controlled `https://yolpol.com`; localized static pages remain environment-neutral. Runtime proxy and dynamic metadata-route evaluation keep Staging responses non-indexable while Production remains indexable. Database-backed web routes additionally require their environment-specific `DATABASE_URL`. Telegram/provider variables remain conditional on composing or executing the corresponding integration, as documented by task 0053.

No migration runs during image build or web startup. No Inquiry Notification, Conversation Translation, or AI Fallback worker starts in the web container.

## Build and local run

Build the non-published local image from the repository root:

```bash
docker build --pull --tag yolpol-web:local .
```

Run a Staging smoke container without connecting to a real database:

```bash
docker run --rm --name yolpol-web-staging-smoke \
  --publish 127.0.0.1:3100:3000 \
  --env YOLPOL_DEPLOYMENT_ENVIRONMENT=staging \
  --env YOLPOL_APP_ORIGIN=https://staging.yolpol.com \
  yolpol-web:local
```

Run the same image with Production identity on a different local host port:

```bash
docker run --rm --name yolpol-web-production-smoke \
  --publish 127.0.0.1:3101:3000 \
  --env YOLPOL_DEPLOYMENT_ENVIRONMENT=production \
  --env YOLPOL_APP_ORIGIN=https://yolpol.com \
  yolpol-web:local
```

These commands exercise only static and metadata routes. They deliberately omit `DATABASE_URL`; database-backed routes are outside the no-real-database smoke boundary.

## Build context and image contents

`.dockerignore` excludes Git metadata, GitHub/editor configuration, all `.env*` files, dependency/build caches, Next.js output, test output, tests, documentation, local Compose definitions, logs, PEM files, and TypeScript incremental output. It retains the application source, public assets, package metadata, Next.js/TypeScript/PostCSS configuration, and tooling required by the repository-wide TypeScript build. The committed `drizzle` directory remains available to future Docker build definitions but is not copied into this web runtime.

## Health, CI, and deferred delivery work

The Dockerfile has no `HEALTHCHECK`. The application currently has no reliable content-free liveness endpoint, and using `/` would conflate localized page rendering with container health. A dedicated endpoint and health semantics remain deferred to `feature/health-logging-observability`.

`.github/workflows/ci.yml` is unchanged. Its `Quality`, `Disposable PostgreSQL integration tests`, and `Production build` jobs remain intact. A secret-free Docker build validation job may be added in a later focused CI/container-validation feature; this task validates the image locally and does not publish it.

Staging/Production Compose, TLS, DNS, server provisioning, registry publishing, deployment workflows, promotion, rollback, backup, monitoring, runtime worker loops, and OCI release-label automation remain deferred.

## Local verification record

The final repository Dockerfile built successfully as `yolpol-web:local` with image ID `sha256:7f7689d9e9bf755564d31220d0d99eacdb380b1f73b809bce53b2cbd05afca6b`. The pinned base reports Node.js `22.23.2`, and the dependency stage used pnpm `11.14.0`. Docker reports an uncompressed image size of `321046611` bytes (`306.17 MiB`). The full uncached context transfer was approximately `8.27 MB`; subsequent builds transferred only changed context data.

The final Dockerfile contains no alternate registry configuration. Direct local registry access initially reset TLS connections; a temporary non-repository diagnostic populated only BuildKit's external download caches, after which the unchanged Dockerfile completed against its normal registry configuration. Frozen-lockfile and supply-chain policy verification remained enabled.

The Production smoke container used `YOLPOL_DEPLOYMENT_ENVIRONMENT=production` and `YOLPOL_APP_ORIGIN=https://yolpol.com`. The generated server listened on `0.0.0.0:3000`; `/en`, `/tr`, `/fa`, and `/ar` returned `200` with the expected locale and direction. `robots.txt` allowed crawling and advertised `https://yolpol.com/sitemap.xml`; the non-empty sitemap contained Production URLs. A safe invalid Inquiry payload reached validation with status `422` for the configured Production Origin and was rejected with `403` for the Staging Origin.

The same image started with `YOLPOL_DEPLOYMENT_ENVIRONMENT=staging` and `YOLPOL_APP_ORIGIN=https://staging.yolpol.com`. All four locale roots returned `X-Robots-Tag: noindex, nofollow, noarchive` while retaining Production canonical URLs. `robots.txt` disallowed all crawling and advertised no sitemap; `sitemap.xml` contained no URL or location entry. The Staging Origin reached validation with status `422`, while the Production Origin was rejected with `403`.

Both containers ran as `nextjs:nodejs` (`1001:1001`). Image configuration contains only the base toolchain values plus `NEXT_TELEMETRY_DISABLED`, `NODE_ENV`, `HOSTNAME`, and `PORT`; no secret was supplied. Inspection found no `.env*` file, `.git` metadata, credential-like file, secret-bearing history entry, or container mount. Public assets and `.next/static` were present; `src`, `tooling`, and `drizzle` were absent. Both containers terminated from Docker's `SIGTERM` within the stop timeout with status `143`, `OOMKilled=false`; the disposable containers and intermediate dependency-stage image were removed without any volume operation. The final `yolpol-web:local` image remains available locally.
