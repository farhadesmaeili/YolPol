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
