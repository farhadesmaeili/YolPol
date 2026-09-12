FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN --mount=type=cache,id=corepack,target=/root/.cache/node/corepack \
    corepack enable \
    && corepack prepare pnpm@11.14.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=cache,id=corepack,target=/root/.cache/node/corepack \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .

RUN --mount=type=cache,id=corepack,target=/root/.cache/node/corepack \
    pnpm build

FROM dependencies AS production-dependencies

RUN --mount=type=cache,id=corepack,target=/root/.cache/node/corepack \
    pnpm prune --prod

FROM dependencies AS monitoring-build

COPY tooling/monitoring ./tooling/monitoring

RUN ./node_modules/.bin/esbuild tooling/monitoring/run-operations-metrics.ts \
    --bundle \
    --platform=node \
    --format=cjs \
    --external:pg-native \
    --outfile=/tmp/operations-metrics.cjs

FROM base AS worker-runtime

ENV NODE_ENV=production

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --home-dir /app --no-create-home --shell /usr/sbin/nologin nextjs

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY tooling/workers ./tooling/workers
COPY src ./src

USER 1001:1001

CMD ["node", "--conditions=react-server", "--import", "tsx", "tooling/workers/inquiry-notifications.ts"]

FROM base AS migration-runtime

ENV NODE_ENV=production

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --home-dir /app --no-create-home --shell /usr/sbin/nologin nextjs

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY tooling/migrations ./tooling/migrations

USER 1001:1001

CMD ["node", "tooling/migrations/run-migrations.mjs"]

FROM base AS monitoring-runtime

ENV NODE_ENV=production

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --home-dir /app --no-create-home --shell /usr/sbin/nologin monitoring

COPY --from=monitoring-build /tmp/operations-metrics.cjs ./operations-metrics.cjs

USER 1001:1001

EXPOSE 9464

CMD ["node", "operations-metrics.cjs"]

FROM postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94 AS postgresql-operations-client

FROM alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce AS operations-runtime

ENV LD_LIBRARY_PATH=/usr/local/lib

RUN apk add --no-cache age jq krb5-libs libedit libldap libpq lz4-libs zstd-libs \
    && addgroup -g 1001 yolpol \
    && adduser -D -H -u 1001 -G yolpol -s /sbin/nologin yolpol

COPY --from=postgresql-operations-client /usr/local/bin/pg_dump /usr/local/bin/pg_restore /usr/local/bin/psql /usr/local/bin/
COPY --from=postgresql-operations-client /usr/local/lib/libpq.so.5.17 /usr/local/lib/libpq.so.5.17
COPY --from=postgresql-operations-client /usr/local/share/postgresql /usr/local/share/postgresql

RUN ln -s libpq.so.5.17 /usr/local/lib/libpq.so.5

COPY --chmod=0555 tooling/backup-restore/backup-restore.sh /usr/local/bin/yolpol-backup-restore

USER 1001:1001

ENTRYPOINT ["/usr/local/bin/yolpol-backup-restore"]
CMD ["help"]

FROM operations-runtime AS operations-test

COPY --chmod=0555 tooling/backup-restore/test-backup-restore.sh /usr/local/bin/test-yolpol-backup-restore

ENTRYPOINT ["/usr/local/bin/test-yolpol-backup-restore"]

FROM base AS runtime

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --home-dir /app --no-create-home --shell /usr/sbin/nologin nextjs

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

RUN mkdir -p .next/cache \
    && chown nextjs:nodejs .next/cache

USER 1001:1001

EXPOSE 3000

CMD ["node", "server.js"]
