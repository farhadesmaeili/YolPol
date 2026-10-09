FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.14.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json vitest.config.mts vitest.integration.config.mts ./
COPY src ./src
COPY tooling/customer-acquisition ./tooling/customer-acquisition
COPY tooling/testing/server-only.mjs ./tooling/testing/server-only.mjs
COPY drizzle-customer-acquisition ./drizzle-customer-acquisition
RUN ./node_modules/.bin/esbuild tooling/customer-acquisition/api.ts tooling/customer-acquisition/migrate.ts --bundle --platform=node --target=node22 --format=cjs --external:pg-native --outdir=/compiled --out-extension:.js=.cjs

FROM build AS integration
CMD ["./node_modules/.bin/vitest", "run", "--config", "vitest.integration.config.mts", "src/features/customer-acquisition"]

FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /compiled/api.cjs ./api.cjs
USER 1000:1000
CMD ["node", "api.cjs"]

FROM runtime AS migration
COPY --from=build /compiled/migrate.cjs ./migrate.cjs
COPY --from=build /app/drizzle-customer-acquisition ./drizzle-customer-acquisition
CMD ["node", "migrate.cjs"]
